import { Injectable, Logger } from '@nestjs/common';
import { esfLineAmounts, esfLinesTotal, type EsfDraftLine } from '@ai-vault/doc-placeholders';
import { EsfDraftClient } from './esf-draft.client';
import { formAction, formFields } from './esf-form';
import { EsfPortalClient, EsfPortalError } from './esf-portal.client';
import { buildReceiptXml, EsfXmlError, type EsfXmlGood } from './esf-xml';

/**
 * Создание черновика ЭСФ пакетной загрузкой XML — официальный путь интеграции
 * учётных систем с ИС ЭСФ. В «Реализации» портал умеет «Выгрузить выделенные
 * в XML-файл» и «Загрузить файл»: берём выгрузку прошлой ЭСФ партнёра как
 * образец реквизитов, переписываем услуги, даты и номера и загружаем обратно.
 *
 * Чем это лучше заполнения формы: один запрос вместо десятка шагов с ViewState,
 * услуга в XML — обычный текст, поэтому карточку в справочнике портала заводить
 * не нужно. Черновик остаётся «Новым» — подписывает человек с ЭЦП.
 */

const LIST_PATH = '/esf/view/document/realization_list.xhtml';
const EXPORT_LABEL = 'Выгрузить выделенные в XML-файл';
const UPLOAD_LABEL = 'Загрузить файл';

type Session = Awaited<ReturnType<EsfPortalClient['openSession']>>;

/** Сбой до загрузки файла: на портале ничего не создано, можно пробовать иначе. */
export class EsfXmlPrepareError extends EsfPortalError {}

export interface XmlDraftRequest {
  login: string;
  password: string;
  /** UUID ЭСФ-образца этого партнёра (Отправлен/Принят). */
  sourceUuid: string;
  /** Отпечаток строк образца — менеджер подтверждал именно их. */
  sourceSignature: string;
  crmRef: string;
  note: string;
  /** yyyy-mm-dd */
  deliveryDate: string;
  contractNumber?: string;
  /** yyyy-mm-dd */
  contractDate?: string;
  lines: { name: string; quantity: number; price: number }[];
  /** Сумма расчёта — сверяем перед отправкой. */
  amount: number;
}

interface ListRow {
  rowKey: string;
  uuid: string;
  status: string;
  crmRef: string;
}

@Injectable()
export class EsfXmlClient {
  private readonly logger = new Logger(EsfXmlClient.name);

  constructor(private readonly portal: EsfPortalClient, private readonly draft: EsfDraftClient) {}

  async createDraft(req: XmlDraftRequest): Promise<{ uuid: string }> {
    // Единицы, ГКЭД и ставки налогов остаются от образца — менеджер правил
    // только название, количество и цену, и подтверждал именно эти строки.
    const template = await this.draft.getTemplate(req.login, req.password, req.sourceUuid);
    if (template.sourceSignature !== req.sourceSignature) {
      throw new EsfXmlPrepareError('ЭСФ-образец изменился. Загрузите строки заново и проверьте их.', 'parse');
    }
    if (req.lines.length !== template.lines.length) {
      throw new EsfXmlPrepareError('Проверьте все строки услуг ЭСФ-образца.', 'parse');
    }
    const lines: EsfDraftLine[] = template.lines.map((line, index) => {
      const input = req.lines[index]!;
      if (!input.name?.trim() || input.name.trim().length > 150 ||
        !Number.isFinite(input.quantity) || input.quantity <= 0 || input.quantity > 1e9 ||
        !Number.isFinite(input.price) || input.price <= 0 || input.price > 1e9) {
        throw new EsfXmlPrepareError(`Проверьте название, количество и цену строки ${index + 1}.`, 'parse');
      }
      return { ...line, name: input.name.trim(), quantity: input.quantity, price: input.price };
    });

    const total = esfLinesTotal(lines);
    if (Math.round(total * 100) !== Math.round(req.amount * 100)) {
      throw new EsfXmlPrepareError('Сумма строк ЭСФ должна совпадать с суммой расчёта.', 'parse');
    }
    const session = await this.portal.openSession(req.login, req.password);

    const sourceXml = await this.exportReceipt(session, req.sourceUuid);
    const goods: EsfXmlGood[] = lines.map((line) => {
      const amounts = esfLineAmounts(line);
      return { name: line.name, quantity: line.quantity, price: line.price, vat: amounts.vat, salesTax: amounts.salesTax };
    });
    let xml: string;
    try {
      xml = buildReceiptXml(sourceXml, {
        crmRef: req.crmRef,
        note: req.note,
        deliveryDate: req.deliveryDate,
        ...(req.contractNumber ? { contractNumber: req.contractNumber } : {}),
        ...(req.contractDate ? { contractDate: req.contractDate } : {}),
        goods,
        totalCost: total,
      });
    } catch (error) {
      throw new EsfXmlPrepareError(error instanceof EsfXmlError ? error.message : 'Не удалось собрать файл ЭСФ', 'parse');
    }

    // Повторная загрузка того же номера учётной системы создала бы второй черновик.
    if (await this.findByCrmRef(session, req.crmRef)) {
      throw new EsfPortalError(`ЭСФ с номером учётной системы ${req.crmRef} уже есть на портале`, 'parse');
    }

    const messages = await this.upload(session, xml, `vault-${req.crmRef}.xml`);
    const created = await this.findByCrmRef(session, req.crmRef);
    if (!created) {
      throw new EsfPortalError(
        `Портал не создал черновик из файла${messages.length ? `: ${messages.join('; ')}` : '. Проверьте «Реализацию» на портале.'}`,
        'parse',
      );
    }
    this.logger.log(`Черновик ЭСФ ${created.uuid} загружен файлом по образцу ${req.sourceUuid}`);
    return { uuid: created.uuid };
  }

  /** Выгрузка ЭСФ в XML — образец реквизитов для новой. */
  private async exportReceipt(session: Session, uuid: string): Promise<string> {
    const { html, rows } = await this.loadRows(session);
    const row = rows.find((r) => r.uuid === uuid);
    if (!row) throw new EsfXmlPrepareError('ЭСФ-образец не найдена в списке «Реализация»', 'parse');
    const button = this.buttonName(html, EXPORT_LABEL);
    if (!button) throw new EsfXmlPrepareError(`На портале нет действия «${EXPORT_LABEL}»`, 'parse');

    const response = await session.post(`${LIST_PATH}?cid=1`, new URLSearchParams({
      ...formFields(html, 'form'),
      'form:table_first': '0',
      'form:table_rows': '200',
      'form:table_selection': row.rowKey,
      [button]: EXPORT_LABEL,
    }));
    const body = await response.text();
    if (!body.trimStart().startsWith('<?xml') || !body.includes('<receipts')) {
      throw new EsfXmlPrepareError('Портал не отдал XML ЭСФ-образца', 'parse');
    }
    return body;
  }

  /**
   * Диалог «Форма загрузки файла»: прикрепить файл (ajax multipart) и нажать
   * «Сохранить» — только после этого портал разбирает пакет. Формы диалога
   * живут на своей странице, поэтому постим на их собственный action.
   */
  private async upload(session: Session, xml: string, filename: string): Promise<string[]> {
    const list = await session.get(LIST_PATH);
    const opener = this.formWith(list, UPLOAD_LABEL);
    if (!opener) throw new EsfXmlPrepareError(`На портале нет кнопки «${UPLOAD_LABEL}»`, 'parse');
    const opened = await session.post(`${LIST_PATH}?cid=1`, new URLSearchParams({
      [opener.id]: opener.id,
      [opener.button]: UPLOAD_LABEL,
      'javax.faces.ViewState': this.portal.viewStateOf(list, opener.id),
    }));
    const page = await opened.text();
    const uploadForm = 'provisionFileUploadForm';
    if (!page.includes(`${uploadForm}:upLoad_input`)) {
      throw new EsfXmlPrepareError('Портал не открыл форму загрузки файла', 'parse');
    }

    const body = new FormData();
    body.set('javax.faces.partial.ajax', 'true');
    body.set('javax.faces.source', `${uploadForm}:upLoad`);
    body.set('javax.faces.partial.execute', `${uploadForm}:upLoad`);
    body.set('javax.faces.partial.render', `${uploadForm}:messages filesForm`);
    body.set(uploadForm, uploadForm);
    body.set('javax.faces.ViewState', this.portal.viewStateOf(page, uploadForm));
    // Ajax-загрузчик PrimeFaces шлёт файл под id компонента, а не под именем
    // поля ввода (`…:upLoad_input`) — с ним портал молча не видит файла.
    body.set(`${uploadForm}:upLoad`, new Blob([xml], { type: 'text/xml' }), filename);

    const attached = await session.postMultipart(formAction(page, uploadForm), body, {
      headers: { 'Faces-Request': 'partial/ajax', 'X-Requested-With': 'XMLHttpRequest' },
    });
    const partial = await attached.text();
    const messages = this.messages(partial);
    if (attached.status >= 400 || !partial.includes('<partial-response')) {
      throw new EsfPortalError(`Портал не принял файл ЭСФ${messages.length ? `: ${messages.join('; ')}` : ''}`, 'parse');
    }
    if (!partial.includes(filename)) {
      throw new EsfPortalError(`Портал не принял файл ЭСФ${messages.length ? `: ${messages.join('; ')}` : ' — он не появился в списке прикреплённых'}`, 'parse');
    }

    const save = this.formWithName(page, ':saveBtn');
    if (!save) throw new EsfPortalError('В форме загрузки нет кнопки «Сохранить»', 'parse');
    const viewState = partial.match(/javax\.faces\.ViewState[^>]*><!\[CDATA\[([\s\S]*?)\]\]>/)?.[1]
      ?? this.portal.viewStateOf(page, save.id);
    const response = await session.post(formAction(page, save.id), new URLSearchParams({
      [save.id]: save.id,
      [`${save.id}:saveBtn`]: 'Сохранить',
      'javax.faces.ViewState': viewState,
    }));
    const result = await response.text();
    const saveMessages = [...new Set([...messages, ...this.messages(result)])];
    this.logger.log(`Пакетная загрузка ЭСФ: HTTP ${response.status}${saveMessages.length ? ` — ${saveMessages.join('; ')}` : ''}`);
    if (response.status >= 400) {
      throw new EsfPortalError(`Портал отклонил файл ЭСФ${saveMessages.length ? `: ${saveMessages.join('; ')}` : ''}`, 'parse');
    }
    return saveMessages;
  }

  /** Своя ЭСФ после загрузки узнаётся по номеру учётной системы. */
  private async findByCrmRef(session: Session, crmRef: string): Promise<ListRow | null> {
    const { rows } = await this.loadRows(session);
    return rows.find((row) => row.crmRef.trim() === crmRef) ?? null;
  }

  private async loadRows(session: Session): Promise<{ html: string; rows: ListRow[] }> {
    const html = await session.get(LIST_PATH);
    if (html.includes('id="login-form"')) throw new EsfPortalError('Портал не принял сессию', 'auth');
    return { html, rows: this.parseRows(html) };
  }

  /** Ключ строки портала — его собственный номер, а не UUID документа. */
  private parseRows(html: string): ListRow[] {
    return [...html.matchAll(/<tr\b[^>]*data-rk="(\d+)"[\s\S]*?<\/tr>/g)].map((match) => {
      const cells = [...match[0].matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/g)]
        .map((cell) => cell[1]!.replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim());
      const uuid = cells.find((text) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(text)) ?? '';
      return { rowKey: match[1]!, uuid, status: cells[7] ?? '', crmRef: cells[5] ?? '' };
    }).filter((row) => row.uuid);
  }

  /** Форма, в которой есть поле с таким суффиксом имени (id формы у портала плавает). */
  private formWithName(html: string, suffix: string): { id: string } | null {
    for (const form of html.matchAll(/<form\b[^>]*\bid="([^"]+)"[^>]*>([\s\S]*?)<\/form>/g)) {
      if (form[2]!.includes(`${form[1]}${suffix}`)) return { id: form[1]! };
    }
    return null;
  }

  private buttonName(html: string, label: string): string | null {
    return html.match(new RegExp(`<input[^>]*name="([^"]+)"[^>]*value="${label}"`))?.[1]
      ?? html.match(new RegExp(`<input[^>]*value="${label}"[^>]*name="([^"]+)"`))?.[1]
      ?? null;
  }

  /** Форма, внутри которой лежит кнопка с такой подписью (id формы у портала плавает). */
  private formWith(html: string, label: string): { id: string; button: string } | null {
    for (const form of html.matchAll(/<form\b[^>]*\bid="([^"]+)"[^>]*>([\s\S]*?)<\/form>/g)) {
      const button = this.buttonName(form[2]!, label);
      if (button) return { id: form[1]!, button };
    }
    return null;
  }

  private messages(xml: string): string[] {
    return [...new Set([
      ...[...xml.matchAll(/"(?:summary|detail)":"((?:[^"\\]|\\.)*)"/g)].map((m) => m[1]!),
      ...[...xml.matchAll(/ui-messages?-(?:error|info|warn)-(?:summary|detail)[^>]*>([^<]+)</g)].map((m) => m[1]!),
    ])].map((text) => text.replace(/\\"/g, '"').trim()).filter(Boolean);
  }
}
