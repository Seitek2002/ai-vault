import { Injectable, Logger } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { esfLineAmounts, esfLinesTotal, type EsfDraftLine } from '@ai-vault/doc-placeholders';
import { decodeHtml, formAction, formFields, formScope, htmlText, parseServiceTable, type PortalServiceLine } from './esf-form';
import { EsfPortalClient, EsfPortalError, type EsfListRow } from './esf-portal.client';

/**
 * Создание черновика ЭСФ в кабинете esf.salyk.kg.
 *
 * Полностью заполнять форму с нуля (15 полей с автокомплитами: ИНН, вид
 * поставки, НДС, счета, форма оплаты…) хрупко. Портал умеет «Создать копию» —
 * одно действие в списке «Реализация» даёт черновик со всеми реквизитами
 * прошлой ЭСФ этого партнёра. Дальше правим только то, что меняется от месяца
 * к месяцу: дату поставки, сумму, номер учётной системы и примечание.
 *
 * Черновик остаётся в статусе «Новый». Подписать и отправить его может
 * только человек с ЭЦП — Vault этого не делает.
 */

const LIST_PATH = '/esf/view/document/realization_list.xhtml';
const FORM_PATH = '/esf/view/document/realization_form.xhtml';

export interface DraftRequest {
  login: string;
  password: string;
  /** UUID ЭСФ-образца этого же партнёра (Отправлен/Принят). */
  sourceUuid: string;
  /** Общая сумма, сом. */
  amount: number;
  /** Дата поставки, dd-mm-yyyy. */
  deliveryDate: string;
  /** «Номер учётной системы» — по нему Vault потом узнаёт свою ЭСФ. */
  crmRef: string;
  note: string;
  sourceSignature: string;
  lines: { name: string; quantity: number; price: number }[];
}

export interface DraftResult {
  uuid: string;
}

interface ListState {
  rows: (EsfListRow & { actions: Record<string, string> })[];
  viewState: string;
  path: string;
}

export interface EsfDraftTemplate {
  sourceSignature: string;
  lines: EsfDraftLine[];
}

function publicLines(lines: PortalServiceLine[]): EsfDraftLine[] {
  return lines.map(({ name, quantity, price, unit, gked, vatRate, salesTaxRate, priceIncludesTaxes }) =>
    ({ name, quantity, price, unit, gked, vatRate, salesTaxRate, priceIncludesTaxes: priceIncludesTaxes ?? false }));
}

function signature(lines: EsfDraftLine[]): string {
  return createHash('sha256').update(JSON.stringify(lines)).digest('hex');
}

@Injectable()
export class EsfDraftClient {
  private readonly logger = new Logger(EsfDraftClient.name);

  constructor(private portal: EsfPortalClient) {}

  async getTemplate(login: string, password: string, sourceUuid: string): Promise<EsfDraftTemplate> {
    const session = await this.portal.openSession(login, password);
    return this.readTemplate(session, sourceUuid);
  }

  private async readTemplate(session: EsfSession, sourceUuid: string): Promise<EsfDraftTemplate> {
    let list = await this.loadList(session);
    let source = list.rows.find(r => r.uuid === sourceUuid);
    if (!source) { list = await this.loadListWide(session); source = list.rows.find(r => r.uuid === sourceUuid); }
    const view = source?.actions['Просмотр'];
    if (!view) throw new EsfPortalError('Не удалось открыть ЭСФ-образец для просмотра', 'parse');
    const response = await session.post(list.path, new URLSearchParams({ form: 'form', [view]: 'Просмотр', 'javax.faces.ViewState': list.viewState }));
    const lines = publicLines(parseServiceTable(await response.text()));
    return { lines, sourceSignature: signature(lines) };
  }

  async createByCopy(req: DraftRequest): Promise<DraftResult> {
    const session = await this.portal.openSession(req.login, req.password);
    const template = await this.readTemplate(session, req.sourceUuid);
    if (template.sourceSignature !== req.sourceSignature) throw new EsfPortalError('ЭСФ-образец изменился. Загрузите строки заново и проверьте их.', 'parse');
    if (!req.lines?.length || req.lines.length !== template.lines.length) throw new EsfPortalError('Проверьте все строки услуг ЭСФ-образца.', 'parse');
    const lines = template.lines.map((line, i) => {
      const input = req.lines[i]!;
      if (typeof input.name !== 'string' || !input.name.trim() || input.name.trim().length > 150 ||
        !Number.isFinite(input.quantity) || input.quantity <= 0 || input.quantity > 1e9 ||
        !Number.isFinite(input.price) || input.price < 0 || input.price > 1e9 ||
        [input.quantity, input.price].some(n => Math.abs(n - Number(n.toFixed(5))) > 1e-9)) {
        throw new EsfPortalError(`Проверьте название, количество и цену строки ${i + 1}. Допустимо до 5 знаков после запятой.`, 'parse');
      }
      return { ...line, name: input.name.trim(), quantity: input.quantity, price: input.price };
    });
    if (Math.round(esfLinesTotal(lines) * 100) !== Math.round(req.amount * 100)) throw new EsfPortalError('Сумма строк ЭСФ должна совпадать с суммой расчёта.', 'parse');

    // 1. Список: находим образец и имя его кнопки «Создать копию».
    let list = await this.loadList(session);
    let source = list.rows.find((r) => r.uuid === req.sourceUuid);
    if (!source) {
      // Образец не на первой странице — раскрываем список до 200 строк.
      list = await this.loadListWide(session);
      source = list.rows.find((r) => r.uuid === req.sourceUuid);
    }
    if (!source) throw new EsfPortalError('ЭСФ-образец не найдена в списке «Реализация»', 'parse');
    const copyButton = source.actions['Создать копию'];
    if (!copyButton) throw new EsfPortalError('У ЭСФ-образца нет действия «Создать копию»', 'parse');

    const before = new Set(list.rows.map((r) => r.uuid));

    // 2. «Создать копию» — обычный submit формы списка; портал сразу создаёт черновик.
    await session.post(list.path, new URLSearchParams({
      form: 'form',
      [copyButton]: 'Создать копию',
      'javax.faces.ViewState': list.viewState,
    }));

    // 3. Черновик — новая строка «Новый» с тем же контрагентом.
    list = await this.loadList(session);
    const draft = list.rows.find(
      (r) => !before.has(r.uuid) && /новый/i.test(r.status) && r.counterpartyName === source!.counterpartyName,
    );
    if (!draft) throw new EsfPortalError('Портал не создал копию — черновик не найден в списке', 'parse');
    const editButton = draft.actions['Редактировать'];
    if (!editButton) throw new EsfPortalError('У черновика нет действия «Редактировать»', 'parse');

    try {
      // 4. Открываем форму редактирования (редирект на realization_form.xhtml?cid=N).
      const opened = await session.post(list.path, new URLSearchParams({
        form: 'form',
        [editButton]: 'Редактировать',
        'javax.faces.ViewState': list.viewState,
      }));
      const formUrl = new URL(opened.url);
      if (!formUrl.pathname.endsWith(FORM_PATH)) {
        throw new EsfPortalError('Портал не открыл форму редактирования черновика', 'parse');
      }
      let formHtml = await opened.text();
      let fields = this.parseForm(formHtml);
      const saveButton = this.findButton(formHtml, 'Сохранить');
      if (!saveButton) throw new EsfPortalError('На форме нет кнопки «Сохранить»', 'parse');

      // Names are catalogue selections, not free-text invoice fields. Keep the
      // copied units/classification, and select the exact reviewed service title.
      let portalLines = parseServiceTable(formHtml);
      if (portalLines.length !== lines.length) throw new EsfPortalError('Количество строк скопированной ЭСФ изменилось', 'parse');
      for (let i = 0; i < lines.length; i++) {
        if (portalLines[i]!.name === lines[i]!.name) continue;
        const serviceId = await this.ensureService(session, formHtml, lines[i]!, portalLines[i]!);
        formHtml = await session.get(`${FORM_PATH}${formUrl.search}`);
        fields = this.parseForm(formHtml);
        portalLines = parseServiceTable(formHtml, false);
        const nameKey = portalLines[i]!.keys.name;
        if (!nameKey) throw new EsfPortalError('Не найден выбор услуги в строке ЭСФ', 'parse');
        fields[`${nameKey}_input`] = lines[i]!.name;
        fields[`${nameKey}_hinput`] = serviceId;
        const changed = await this.partial(session, formAction(formHtml, 'mainform'), fields, nameKey, { 'javax.faces.behavior.event': 'itemSelect', 'javax.faces.partial.event': 'itemSelect' });
        formHtml = this.replaceTable(formHtml, changed);
        fields = this.parseForm(formHtml);
        portalLines = parseServiceTable(formHtml, false);
        if (portalLines[i]!.name !== lines[i]!.name || portalLines[i]!.unit !== lines[i]!.unit || portalLines[i]!.gked !== lines[i]!.gked) {
          throw new EsfPortalError(`Портал выбрал другую услугу или классификацию в строке ${i + 1}. Проверьте черновик ${draft.uuid}.`, 'parse');
        }
      }

      // Let the portal recalculate each line using its own tax rules. This also
      // updates server-side bounds on net/total fields before the final submit.
      for (let i = 0; i < lines.length; i++) {
        for (const column of ['quantity', 'price'] as const) {
          const key = parseServiceTable(formHtml, false)[i]!.keys[column];
          if (!key) throw new EsfPortalError(`Не найдено поле ${column} строки ${i + 1}`, 'parse');
          fields[`${key}_input`] = this.portalDecimal(lines[i]![column], 5);
          fields[`${key}_hinput`] = lines[i]![column].toFixed(5);
          const changed = await this.partial(session, formAction(formHtml, 'mainform'), fields, key, { 'javax.faces.behavior.event': 'blur', 'javax.faces.partial.event': 'blur' });
          formHtml = this.replaceTable(formHtml, changed);
          fields = this.parseForm(formHtml);
        }
      }
      portalLines = parseServiceTable(formHtml);
      if (portalLines.some((line, i) => line.name !== lines[i]!.name || line.quantity !== lines[i]!.quantity || line.price !== lines[i]!.price) ||
        Math.round(esfLinesTotal(portalLines) * 100) !== Math.round(req.amount * 100)) {
        throw new EsfPortalError(`Портал рассчитал другие значения. Проверьте черновик ${draft.uuid} перед подписью.`, 'parse');
      }
      this.fillNumericFields(fields, portalLines);
      const amount = req.amount.toFixed(2);
      Object.assign(fields, {
        ownedCrmReceiptCode: req.crmRef,
        deliveryDate_input: req.deliveryDate,
        note: req.note,
        [saveButton]: 'Сохранить',
      });

      const saved = await session.post(formAction(formHtml, 'mainform'), new URLSearchParams(fields));
      const savedHtml = await saved.text();
      if (!new URL(saved.url).pathname.endsWith(LIST_PATH)) {
        const errors = this.messages(savedHtml);
        throw new EsfPortalError(
          errors.length ? `Портал не сохранил черновик: ${errors.join('; ')}` : 'Портал не сохранил черновик',
          'parse',
        );
      }

      this.logger.log(`Черновик ЭСФ ${draft.uuid} создан копией ${req.sourceUuid} на ${amount}`);
      return { uuid: draft.uuid };
    } catch (error) {
      throw new EsfPortalError(`Черновик ${draft.uuid} уже создан на портале, но заполнение не завершено. Откройте его и проверьте строки; не создавайте повторную копию. ${error instanceof Error ? error.message : 'Портал не обработал запрос.'}`, 'parse');
    }
  }

  // ── Список ────────────────────────────────────────────────────────────────

  private async loadList(session: EsfSession): Promise<ListState> {
    const html = await session.get(LIST_PATH);
    if (html.includes('id="login-form"')) throw new EsfPortalError('Портал не принял сессию', 'auth');
    return { rows: this.parseRows(html), viewState: this.portal.viewStateOf(html, 'form'), path: formAction(html, 'form') };
  }

  private async loadListWide(session: EsfSession): Promise<ListState> {
    const page = await this.loadList(session);
    const body = new URLSearchParams({
      'javax.faces.partial.ajax': 'true',
      'javax.faces.source': 'form:table',
      'javax.faces.partial.execute': 'form:table',
      'javax.faces.partial.render': 'form:table',
      'form:table': 'form:table',
      'form:table_pagination': 'true',
      'form:table_first': '0',
      'form:table_rows': '200',
      'form:table_skipChildren': 'true',
      'form:table_encodeFeature': 'true',
      form: 'form',
      'javax.faces.ViewState': page.viewState,
    });
    const response = await session.post(page.path, body, {
      headers: { 'Faces-Request': 'partial/ajax', 'X-Requested-With': 'XMLHttpRequest' },
    });
    const xml = await response.text();
    const vs = xml.match(/ViewState[^>]*><!\[CDATA\[([^\]]+)\]\]>/);
    return { rows: this.parseRows(xml), viewState: vs?.[1] ?? page.viewState, path: page.path };
  }

  /** Строки таблицы + имена кнопок действий («Создать копию», «Редактировать»…). */
  private parseRows(html: string): ListState['rows'] {
    const rows = this.portal.parseRows(html);
    const byUuid = new Map(rows.map((r) => [r.uuid, r]));
    const out: ListState['rows'] = [];
    const rowRe = /<tr[^>]*data-rk="[^"]*"[^>]*>([\s\S]*?)<\/tr>/g;
    let m: RegExpExecArray | null;
    while ((m = rowRe.exec(html)) !== null) {
      const uuid = m[1]!.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i)?.[0]?.toLowerCase();
      const row = uuid ? byUuid.get(uuid) : undefined;
      if (!row) continue;
      const actions: Record<string, string> = {};
      for (const a of m[1]!.matchAll(/<input[^>]*name="([^"]+)"[^>]*value="([^"]+)"/g)) {
        actions[a[2]!] = a[1]!;
      }
      out.push({ ...row, actions });
    }
    return out;
  }

  // ── Форма ─────────────────────────────────────────────────────────────────

  private async partial(session: EsfSession, path: string, fields: Record<string, string>, source: string,
    extra: Record<string, string>, formId = 'mainform', render = 'detailTable'): Promise<string> {
    const body = new URLSearchParams({ ...fields, [formId]: formId, 'javax.faces.partial.ajax': 'true',
      'javax.faces.source': source, 'javax.faces.partial.execute': source, 'javax.faces.partial.render': render, ...extra });
    const response = await session.post(path, body, { headers: { 'Faces-Request': 'partial/ajax', 'X-Requested-With': 'XMLHttpRequest' } });
    const xml = await response.text();
    if (!xml.includes('<partial-response') || /<error\b|<redirect\b/.test(xml)) throw new EsfPortalError('Портал не обработал изменение строки. Откройте черновик и проверьте его.', 'parse');
    const errors = this.messages(xml);
    if (errors.length) throw new EsfPortalError(`Портал отклонил строку: ${errors.join('; ')}`, 'parse');
    const state = xml.match(/<update[^>]*id="[^"]*javax\.faces\.ViewState[^"]*"[^>]*><!\[CDATA\[([\s\S]*?)\]\]><\/update>/)?.[1];
    if (state) fields['javax.faces.ViewState'] = state;
    return xml;
  }

  private replaceTable(html: string, xml: string): string {
    const table = xml.match(/<update\b[^>]*id="detailTable"[^>]*><!\[CDATA\[([\s\S]*?)\]\]><\/update>/)?.[1];
    if (!table) throw new EsfPortalError('Портал не вернул обновлённую таблицу услуг', 'parse');
    const pattern = /<div\b[^>]*id="detailTable"[\s\S]*?<\/table><\/div><\/div>/;
    if (!pattern.test(html)) throw new EsfPortalError('Не удалось обновить таблицу услуг портала', 'parse');
    const replaced = html.replace(pattern, () => table);
    const state = xml.match(/<update[^>]*id="[^"]*javax\.faces\.ViewState[^"]*"[^>]*><!\[CDATA\[([\s\S]*?)\]\]><\/update>/)?.[1];
    return state ? replaced.replace(/(name="javax\.faces\.ViewState"[^>]*value=")[^"]*(")/g, (_match, prefix, suffix) => `${prefix}${state}${suffix}`) : replaced;
  }

  private async lookup(session: EsfSession, html: string, formId: string, key: string, query: string) {
    const fields = formFields(html, formId);
    const xml = await this.partial(session, formAction(html, formId), fields, key, { [`${key}_query`]: query }, formId, key);
    const choices = [...xml.matchAll(/<(?:tr|li)\b([^>]*data-item-value="[^"]+"[^>]*)>/g)].map(m => ({
      id: decodeHtml(m[1]!.match(/data-item-value="([^"]+)"/)?.[1] ?? ''),
      label: decodeHtml(m[1]!.match(/data-item-label="([^"]*)"/)?.[1] ?? ''),
    }));
    return { fields, choices };
  }

  private async ensureService(session: EsfSession, invoiceHtml: string, line: EsfDraftLine, copied: PortalServiceLine): Promise<string> {
    if (!copied.keys.name || !copied.unitId) throw new EsfPortalError('Не найден справочник услуги или единицы измерения', 'parse');
    const oldPath = formAction(invoiceHtml, 'mainform');
    const found = await this.lookup(session, invoiceHtml, 'mainform', copied.keys.name, line.name);
    const existing = found.choices.filter(c => c.label === line.name);
    if (existing.length > 1) throw new EsfPortalError(`В справочнике несколько услуг «${line.name}». Уточните название на портале.`, 'parse');
    if (existing[0]) return existing[0].id;

    // Create a separate catalogue record; never rename a historical service.
    const list = await session.get('/esf/view/profile/goods_list.xhtml');
    const link = [...list.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/g)].find(m => htmlText(m[2]!) === 'Добавить новую услугу');
    const onclick = decodeHtml(link?.[1]?.match(/onclick="([^"]+)"/)?.[1] ?? '');
    const formId = onclick.match(/getElementById\('([^']+)'\)/)?.[1];
    const submit = onclick.match(/\{'([^']+)'/)?.[1];
    if (!formId || !submit) throw new EsfPortalError('Не удалось открыть создание услуги в справочнике', 'parse');
    const opened = await session.post(formAction(list, formId), new URLSearchParams({ ...formFields(list, formId), [submit]: submit }));
    const html = await opened.text();
    const goodsForm = 'add-card-form';
    const gked = await this.lookup(session, html, goodsForm, 'cea', line.gked);
    const code = gked.choices.find(c => c.label.split(' - ')[0] === line.gked);
    if (!code) throw new EsfPortalError(`В справочнике не найден ГКЭД ${line.gked}`, 'parse');
    const save = this.findButton(formScope(html, goodsForm), 'Сохранить');
    if (!save) throw new EsfPortalError('Не найдено сохранение услуги в справочнике', 'parse');
    const saved = await session.post(formAction(html, goodsForm), new URLSearchParams({ ...gked.fields,
      cea_input: code.label, cea_hinput: code.id,
      unitClassification_input: line.unit, unitClassification_hinput: copied.unitId, name: line.name, [save]: 'Сохранить' }));
    const result = await saved.text();
    if (!new URL(saved.url).pathname.endsWith('/goods_list.xhtml')) throw new EsfPortalError(`Не удалось добавить услугу: ${this.messages(result).join('; ') || 'проверьте справочник портала'}`, 'parse');
    const restored = await session.get(oldPath);
    const exact = (await this.lookup(session, restored, 'mainform', copied.keys.name, line.name)).choices.filter(c => c.label === line.name);
    if (exact.length !== 1) throw new EsfPortalError('Новая услуга не найдена в справочнике портала', 'parse');
    return exact[0]!.id;
  }

  private fillNumericFields(fields: Record<string, string>, lines: PortalServiceLine[]): void {
    for (const line of lines) {
      const amounts = esfLineAmounts(line);
      for (const column of ['quantity', 'price', 'vat', 'salesTax', 'net', 'total'] as const) {
        const key = line.keys[column];
        if (!key) throw new EsfPortalError(`Не найдено поле ${column} строки услуги`, 'parse');
        const value = column === 'quantity' || column === 'price' ? line[column] : amounts[column];
        const decimals = column === 'quantity' || column === 'price' ? 5 : 2;
        fields[`${key}_input`] = this.portalDecimal(value, decimals);
        fields[`${key}_hinput`] = value.toFixed(decimals);
      }
    }
  }

  private portalDecimal(value: number, decimals: number): string {
    const [int, frac] = value.toFixed(decimals).split('.');
    return `${int!.replace(/\B(?=(\d{3})+(?!\d))/g, ' ')},${frac}`;
  }

  /** Все поля формы как их отправил бы браузер: text/hidden/textarea, чекбоксы — только отмеченные. */
  private parseForm(html: string): Record<string, string> {
    return formFields(html);
  }

  private findButton(html: string, label: string): string | null {
    return html.match(new RegExp(`<input[^>]*name="([^"]+)"[^>]*type="submit"[^>]*value="${label}"`))?.[1]
      ?? html.match(new RegExp(`<input[^>]*type="submit"[^>]*name="([^"]+)"[^>]*value="${label}"`))?.[1]
      ?? null;
  }

  private messages(html: string): string[] {
    return [...html.matchAll(/ui-messages?-error-(?:summary|detail)[^>]*>([^<]+)</g)]
      .map((m) => this.decode(m[1]!).trim())
      .filter(Boolean);
  }

  /** «30 000,00» — как форматирует портал. */
  private portalMoney(n: number): string {
    const [int, frac] = n.toFixed(2).split('.');
    return `${int!.replace(/\B(?=(\d{3})+(?!\d))/g, ' ')},${frac}`;
  }

  private decode(s: string): string {
    return s
      .replace(/&quot;/g, '"')
      .replace(/&#39;|&apos;/g, "'")
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&amp;/g, '&');
  }
}

export type EsfSession = Awaited<ReturnType<EsfPortalClient['openSession']>>;
