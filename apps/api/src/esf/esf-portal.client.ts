import { Injectable, Logger } from '@nestjs/common';

/**
 * HTTP-клиент кабинета ЭСФ (esf.salyk.kg).
 *
 * Портал — PrimeFaces/JSF: состояние формы живёт на сервере, каждая страница
 * несёт `javax.faces.ViewState`, сессия — в cookie JSESSIONID и привязана к
 * узлу кластера. Ниже воспроизведён ровно тот обмен, который делает браузер:
 * логин-форма → страница списка → partial-запрос пагинации на 200 строк.
 *
 * Сами PDF ЭСФ доступны без входа (страница проверки по QR) — их скачивает
 * `EsfPdfService`, здесь только то, что требует авторизации.
 */

const BASE = 'https://esf.salyk.kg';
const LOGIN_PATH = '/esf/view/user/login_pas.xhtml';
const LIST_PATH = '/esf/view/document/realization_list.xhtml';
const USER_AGENT = 'Mozilla/5.0 (compatible; Vault ESF sync)';
const TIMEOUT_MS = 30000;

export class EsfPortalError extends Error {
  constructor(message: string, readonly kind: 'auth' | 'network' | 'parse') {
    super(message);
    this.name = 'EsfPortalError';
  }
}

export interface EsfListRow {
  uuid: string;
  createdOn: string;   // dd.mm.yyyy
  deliveryDate: string;
  issuedOn: string;
  crmRef: string;
  operationType: string;
  status: string;      // как на портале: Принят / Отправлен / Новый / Отозван / Отклонен
  counterpartyName: string;
  number: string;
  amount: string;      // «30 000,00»
  note: string;
}

/** Cookie-jar на одну сессию: fetch сам cookies не хранит. */
class CookieJar {
  private cookies = new Map<string, string>();

  absorb(response: Response): void {
    const headers = (response.headers as unknown as { getSetCookie?: () => string[] }).getSetCookie?.() ?? [];
    for (const raw of headers) {
      const [pair] = raw.split(';');
      const eq = pair?.indexOf('=') ?? -1;
      if (!pair || eq <= 0) continue;
      this.cookies.set(pair.slice(0, eq).trim(), pair.slice(eq + 1).trim());
    }
  }

  header(): string {
    return [...this.cookies.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
  }
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function decodeEntities(s: string): string {
  return s
    .replace(/&nbsp;/g, ' ')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

function stripTags(html: string): string {
  return decodeEntities(html.replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim();
}

@Injectable()
export class EsfPortalClient {
  private readonly logger = new Logger(EsfPortalClient.name);

  /**
   * Логинится и возвращает все строки «Реализация → ЭСФ».
   * Пароль живёт только в аргументе на время вызова.
   */
  async fetchRealizationList(login: string, password: string): Promise<EsfListRow[]> {
    const jar = new CookieJar();

    // 1. Страница входа: получаем JSESSIONID и ViewState формы.
    const loginPage = await this.get(LOGIN_PATH, jar);
    const viewState = this.extractViewState(loginPage, 'login-form');
    const submitName = this.extractSubmitName(loginPage);

    // 2. Отправляем форму. Успех — редирект на main.xhtml; ошибка — та же страница с сообщением.
    const body = new URLSearchParams({
      'login-form': 'login-form',
      username: login,
      password,
      [submitName]: 'Войти',
      'javax.faces.ViewState': viewState,
    });
    const loginResponse = await this.post(LOGIN_PATH, jar, body, { redirect: 'manual' });
    if (loginResponse.status !== 302 && loginResponse.status !== 303) {
      const html = await loginResponse.text();
      throw new EsfPortalError(this.describeLoginFailure(html), 'auth');
    }

    // 3. Страница списка — нужен её ViewState для partial-запроса.
    const listPage = await this.get(LIST_PATH, jar);
    if (listPage.includes('id="login-form"')) {
      throw new EsfPortalError('Портал не принял сессию после входа', 'auth');
    }
    const listViewState = this.extractViewState(listPage, 'form');

    // 4. Пагинация на 200 строк — стандартный partial-запрос PrimeFaces DataTable.
    const pageBody = new URLSearchParams({
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
      'javax.faces.ViewState': listViewState,
    });
    const partial = await this.post(LIST_PATH, jar, pageBody, {
      headers: { 'Faces-Request': 'partial/ajax', 'X-Requested-With': 'XMLHttpRequest' },
    });
    const xml = await partial.text();
    if (!xml.includes('<partial-response')) {
      throw new EsfPortalError('Портал вернул не partial-response на пагинацию', 'parse');
    }

    const rows = this.parseRows(xml);
    this.logger.log(`Список ЭСФ с портала: ${rows.length} строк`);
    return rows;
  }

  /** Проверка учётных данных без чтения списка. */
  async checkCredentials(login: string, password: string): Promise<void> {
    const jar = new CookieJar();
    const loginPage = await this.get(LOGIN_PATH, jar);
    const viewState = this.extractViewState(loginPage, 'login-form');
    const submitName = this.extractSubmitName(loginPage);
    const response = await this.post(
      LOGIN_PATH,
      jar,
      new URLSearchParams({
        'login-form': 'login-form',
        username: login,
        password,
        [submitName]: 'Войти',
        'javax.faces.ViewState': viewState,
      }),
      { redirect: 'manual' },
    );
    if (response.status !== 302 && response.status !== 303) {
      throw new EsfPortalError(this.describeLoginFailure(await response.text()), 'auth');
    }
  }

  // ── HTTP ──────────────────────────────────────────────────────────────────

  private async get(path: string, jar: CookieJar): Promise<string> {
    const response = await this.request(path, jar, { method: 'GET', redirect: 'follow' });
    return response.text();
  }

  private async post(
    path: string,
    jar: CookieJar,
    body: URLSearchParams,
    opts: { redirect?: RequestRedirect; headers?: Record<string, string> } = {},
  ): Promise<Response> {
    return this.request(path, jar, {
      method: 'POST',
      body: body.toString(),
      redirect: opts.redirect ?? 'follow',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        ...(opts.headers ?? {}),
      },
    });
  }

  private async request(
    path: string,
    jar: CookieJar,
    init: RequestInit & { headers?: Record<string, string> },
  ): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const response = await fetch(BASE + path, {
        ...init,
        signal: controller.signal,
        headers: {
          'User-Agent': USER_AGENT,
          Accept: 'text/html,application/xml;q=0.9,*/*;q=0.8',
          ...(jar.header() ? { Cookie: jar.header() } : {}),
          ...(init.headers ?? {}),
        },
      });
      jar.absorb(response);
      return response;
    } catch (error) {
      throw new EsfPortalError(
        `Портал ЭСФ недоступен: ${error instanceof Error ? error.message : String(error)}`,
        'network',
      );
    } finally {
      clearTimeout(timer);
    }
  }

  // ── Разбор ────────────────────────────────────────────────────────────────

  private extractViewState(html: string, formId: string): string {
    // ViewState у каждой формы свой; берём тот, что внутри нужной.
    const formStart = html.indexOf(`id="${formId}"`);
    const scope = formStart >= 0 ? html.slice(formStart) : html;
    const match = scope.match(/name="javax\.faces\.ViewState"[^>]*value="([^"]+)"/);
    if (!match?.[1]) throw new EsfPortalError('На странице портала нет ViewState', 'parse');
    return match[1];
  }

  /** Имя submit-кнопки (`j_idt28`) генерируется JSF и может измениться при обновлении портала. */
  private extractSubmitName(html: string): string {
    const formStart = html.indexOf('id="login-form"');
    const scope = formStart >= 0 ? html.slice(formStart) : html;
    const match = scope.match(/<(?:input|button)[^>]*type="submit"[^>]*name="([^"]+)"/);
    return match?.[1] ?? 'j_idt28';
  }

  private describeLoginFailure(html: string): string {
    const text = stripTags(html);
    if (/неверн|не найден|invalid|incorrect|блокир/i.test(text)) {
      return 'Портал ЭСФ отклонил логин или пароль';
    }
    return 'Не удалось войти в кабинет ЭСФ';
  }

  /** Строки таблицы из CDATA partial-ответа. Порядок колонок — как на портале. */
  private parseRows(xml: string): EsfListRow[] {
    const rows: EsfListRow[] = [];
    const rowRe = /<tr[^>]*data-rk="[^"]*"[^>]*>([\s\S]*?)<\/tr>/g;
    let m: RegExpExecArray | null;
    while ((m = rowRe.exec(xml)) !== null) {
      const cells = [...m[1]!.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((c) => stripTags(c[1] ?? ''));
      const uuid = cells[1] ?? '';
      if (!UUID_RE.test(uuid)) continue;
      rows.push({
        uuid: uuid.toLowerCase(),
        createdOn: cells[2] ?? '',
        deliveryDate: cells[3] ?? '',
        issuedOn: cells[4] ?? '',
        crmRef: cells[5] ?? '',
        operationType: cells[6] ?? '',
        status: cells[7] ?? '',
        counterpartyName: cells[8] ?? '',
        number: cells[9] ?? '',
        amount: cells[10] ?? '',
        note: cells[11] ?? '',
      });
    }
    return rows;
  }
}
