import { Injectable, Logger } from '@nestjs/common';
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
}

export interface DraftResult {
  uuid: string;
}

interface ListState {
  rows: (EsfListRow & { actions: Record<string, string> })[];
  viewState: string;
}

@Injectable()
export class EsfDraftClient {
  private readonly logger = new Logger(EsfDraftClient.name);

  constructor(private portal: EsfPortalClient) {}

  async createByCopy(req: DraftRequest): Promise<DraftResult> {
    const session = await this.portal.openSession(req.login, req.password);

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
    await session.post(LIST_PATH, new URLSearchParams({
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

    // 4. Открываем форму редактирования (редирект на realization_form.xhtml?cid=N).
    const opened = await session.post(LIST_PATH, new URLSearchParams({
      form: 'form',
      [editButton]: 'Редактировать',
      'javax.faces.ViewState': list.viewState,
    }));
    const formUrl = new URL(opened.url);
    if (!formUrl.pathname.endsWith(FORM_PATH)) {
      throw new EsfPortalError('Портал не открыл форму редактирования черновика', 'parse');
    }
    const formHtml = await opened.text();
    const fields = this.parseForm(formHtml);
    const saveButton = this.findButton(formHtml, 'Сохранить');
    if (!saveButton) throw new EsfPortalError('На форме нет кнопки «Сохранить»', 'parse');

    // 5. Правим только переменное. Сумма — в первой строке услуг; строк ровно одна.
    const priceKey = this.detailKey(fields, 233);
    const netKey = this.detailKey(fields, 259);
    const totalKey = this.detailKey(fields, 263);
    if (!priceKey || !netKey || !totalKey) {
      throw new EsfPortalError('Не нашёл поля суммы в строке услуги — вёрстка портала изменилась', 'parse');
    }
    const secondRow = Object.keys(fields).some((k) => k.startsWith('detailTable:1:'));
    if (secondRow) throw new EsfPortalError('В ЭСФ-образце несколько строк услуг — скопируйте вручную', 'parse');

    const amount = req.amount.toFixed(2);
    const money = this.portalMoney(req.amount);
    Object.assign(fields, {
      ownedCrmReceiptCode: req.crmRef,
      deliveryDate_input: req.deliveryDate,
      note: req.note,
      [`${priceKey}_input`]: `${money}000`,
      [`${priceKey}_hinput`]: amount,
      [`${netKey}_input`]: money,
      [`${netKey}_hinput`]: amount,
      [`${totalKey}_input`]: money,
      [`${totalKey}_hinput`]: amount,
      [saveButton]: 'Сохранить',
    });

    const saved = await session.post(`${FORM_PATH}${formUrl.search}`, new URLSearchParams(fields));
    const savedHtml = await saved.text();
    if (new URL(saved.url).pathname.endsWith(FORM_PATH)) {
      const errors = this.messages(savedHtml);
      throw new EsfPortalError(
        errors.length ? `Портал не сохранил черновик: ${errors.join('; ')}` : 'Портал не сохранил черновик',
        'parse',
      );
    }

    this.logger.log(`Черновик ЭСФ ${draft.uuid} создан копией ${req.sourceUuid} на ${amount}`);
    return { uuid: draft.uuid };
  }

  // ── Список ────────────────────────────────────────────────────────────────

  private async loadList(session: EsfSession): Promise<ListState> {
    const html = await session.get(LIST_PATH);
    if (html.includes('id="login-form"')) throw new EsfPortalError('Портал не принял сессию', 'auth');
    return { rows: this.parseRows(html), viewState: this.portal.viewStateOf(html, 'form') };
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
    const response = await session.post(LIST_PATH, body, {
      headers: { 'Faces-Request': 'partial/ajax', 'X-Requested-With': 'XMLHttpRequest' },
    });
    const xml = await response.text();
    const vs = xml.match(/ViewState[^>]*><!\[CDATA\[([^\]]+)\]\]>/);
    return { rows: this.parseRows(xml), viewState: vs?.[1] ?? page.viewState };
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

  /** Все поля формы как их отправил бы браузер: text/hidden/textarea, чекбоксы — только отмеченные. */
  private parseForm(html: string): Record<string, string> {
    const start = html.indexOf('id="mainform"');
    const scope = start >= 0 ? html.slice(start) : html;
    const fields: Record<string, string> = {};
    for (const m of scope.matchAll(/<input\b([^>]*)>/g)) {
      const attrs = m[1]!;
      const name = attrs.match(/\bname="([^"]*)"/)?.[1];
      if (!name) continue;
      const type = attrs.match(/\btype="([^"]*)"/)?.[1] ?? 'text';
      if (type === 'submit' || type === 'button') continue;
      if (type === 'checkbox' || type === 'radio') {
        if (/\bchecked\b/.test(attrs)) fields[name] = attrs.match(/\bvalue="([^"]*)"/)?.[1] ?? 'on';
        continue;
      }
      fields[name] = this.decode(attrs.match(/\bvalue="([^"]*)"/)?.[1] ?? '');
    }
    for (const m of scope.matchAll(/<textarea\b([^>]*)>([\s\S]*?)<\/textarea>/g)) {
      const name = m[1]!.match(/\bname="([^"]*)"/)?.[1];
      if (name) fields[name] = this.decode(m[2]!);
    }
    return fields;
  }

  private findButton(html: string, label: string): string | null {
    return html.match(new RegExp(`<input[^>]*name="([^"]+)"[^>]*type="submit"[^>]*value="${label}"`))?.[1]
      ?? html.match(new RegExp(`<input[^>]*type="submit"[^>]*name="([^"]+)"[^>]*value="${label}"`))?.[1]
      ?? null;
  }

  /**
   * Поля строки услуги именуются `detailTable:0:j_idtNNN`; номера генерирует JSF
   * и они могут сдвинуться при обновлении портала. Ищем по известному номеру,
   * а если его нет — по порядку числовых полей строки.
   */
  private detailKey(fields: Record<string, string>, idt: number): string | null {
    const exact = `detailTable:0:j_idt${idt}`;
    if (`${exact}_hinput` in fields) return exact;
    return null;
  }

  private messages(html: string): string[] {
    return [...html.matchAll(/ui-messages-error-(?:summary|detail)[^>]*>([^<]+)</g)]
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
