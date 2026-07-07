import { DocumentType } from "@ai-vault/types";

const RU_MONTHS = [
  "января","февраля","марта","апреля","мая","июня",
  "июля","августа","сентября","октября","ноября","декабря",
];

// ── Shared ProseMirror node helpers ─────────────────────────────────────────
const t = (text: string) => ({ type: "text", text });
const b = (text: string) => ({ type: "text", text, marks: [{ type: "bold" }] });
const para = (...nodes: object[]) => ({ type: "paragraph", content: nodes });
const boldPara = (text: string) => para(b(text));
const plainPara = (text: string) => para(t(text));
const emptyPara = () => ({ type: "paragraph" });

function withCountry(address: string): string {
  return /кыргыз/i.test(address) ? address : `Кыргызская Республика, ${address}`;
}

function parseLocalDate(iso: string): Date {
  const parts = iso.split("-").map(Number);
  return new Date(parts[0]!, parts[1]! - 1, parts[2]!);
}

export function ruDate(d: Date): string {
  return `${d.getDate()} ${RU_MONTHS[d.getMonth()]} ${d.getFullYear()} г.`;
}

/** «6.07.2026» — числовой формат (для «Основание: Акт … от 6.07.2026 г.») */
export function shortNumericDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return `${d}.${String(m).padStart(2, "0")}.${y}`;
}

/** «6.07.26 г.» — короткий формат для периода услуг в таблице */
export function shortPeriodDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return `${d}.${String(m).padStart(2, "0")}.${String(y).slice(2)} г.`;
}

export function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Replace the old date (or initial placeholder) in the body JSON with the new date. */
export function syncDateInBody(
  bodyJson: unknown,
  prevIso: string,
  newIso: string,
): unknown {
  if (!newIso) return bodyJson;
  let text = JSON.stringify(bodyJson);
  const newFormatted = ruDate(parseLocalDate(newIso));

  if (prevIso) {
    const oldFormatted = ruDate(parseLocalDate(prevIso));
    text = text.split(oldFormatted).join(newFormatted);
    // without «г.» suffix
    const oldShort = oldFormatted.slice(0, -3); // remove " г."
    text = text.split(oldShort).join(newFormatted.slice(0, -3));
    // numeric form «6.07.2026» (используется в «Основание: Акт … от 6.07.2026 г.»)
    text = text.split(shortNumericDate(prevIso)).join(shortNumericDate(newIso));
  } else {
    // Replace the blank placeholder used in all templates
    text = text.split("«___» __________ 202__ г.").join(newFormatted);
  }

  return JSON.parse(text) as unknown;
}

/** «20 000,00» — денежный формат как в счёте */
export function formatAmount(n: number): string {
  const [int, frac] = n.toFixed(2).split(".");
  return `${int!.replace(/\B(?=(\d{3})+(?!\d))/g, " ")},${frac}`;
}

/** Заглушка суммы в шаблоне счёта — заменяется при вводе суммы */
export const AMOUNT_PLACEHOLDER = "__ 000,00";

/** Replace the previous amount (or the blank placeholder) with the new one. */
export function syncAmountInBody(
  bodyJson: unknown,
  prevAmount: number,
  newAmount: number,
): unknown {
  if (!newAmount || newAmount <= 0) return bodyJson;
  const newStr = formatAmount(newAmount);
  let text = JSON.stringify(bodyJson);
  // Пробуем заменить предыдущее значение; если его нет в теле — заглушку из шаблона
  const candidates = [
    ...(prevAmount > 0 ? [formatAmount(prevAmount)] : []),
    AMOUNT_PLACEHOLDER,
  ];
  for (const oldStr of candidates) {
    if (oldStr !== newStr && text.includes(oldStr)) {
      text = text.split(oldStr).join(newStr);
      break;
    }
  }
  return JSON.parse(text) as unknown;
}

/**
 * A run of digits/underscores — never matches JSON syntax characters
 * (quotes, braces, colons, commas), so a pattern built from this piece
 * can never "bridge" across a JSON string boundary into an unrelated
 * text node. `\S+`/`.+` are UNSAFE here: JSON.stringify emits no spaces
 * between adjacent nodes, so an unbounded non-whitespace class can span
 * clean across `"}]},{"type":"text","text":"` and corrupt neighbouring
 * paragraphs. Always build date/number patterns from this instead.
 */
const DATE_SEG = "[\\d_]+";
const DATE_TOKEN = `${DATE_SEG}\\.${DATE_SEG}\\.${DATE_SEG}\\s*г\\.`;

/**
 * Rewrites a whole "period" phrase from the current start/end ISO dates,
 * matching by an anchor pattern rather than diffing the previous string —
 * если периоды совпадают (например, две накладные созданы в один день),
 * обе даты текстуально идентичны, и точечная замена «старое значение →
 * новое» находит 0 совпадений после первой правки. Полная перестройка
 * фразы из актуальных дат исключает эту гонку.
 */
function syncPeriodPhraseInBody(
  bodyJson: unknown,
  startIso: string,
  endIso: string,
  pattern: RegExp,
  build: (start: string, end: string) => string,
): unknown {
  if (!startIso || !endIso) return bodyJson;
  const text = JSON.stringify(bodyJson);
  if (!pattern.test(text)) return bodyJson;
  const newText = text.replace(pattern, build(shortPeriodDate(startIso), shortPeriodDate(endIso)));
  return JSON.parse(newText) as unknown;
}

/** «за период D.MM.YY г. - D.MM.YY г.» — используется в тексте счёта на оплату. */
export function syncPeriodInBody(bodyJson: unknown, startIso: string, endIso: string): unknown {
  return syncPeriodPhraseInBody(
    bodyJson, startIso, endIso,
    new RegExp(`за период\\s+${DATE_TOKEN}\\s*-\\s*${DATE_TOKEN}`),
    (s, e) => `за период ${s} - ${e}`,
  );
}

/** «D.MM.YY г. – D.MM.YY г.» — отдельная ячейка «Период» в таблице АВР (тире, не дефис). */
export function syncAvrPeriodInBody(bodyJson: unknown, startIso: string, endIso: string): unknown {
  return syncPeriodPhraseInBody(
    bodyJson, startIso, endIso,
    new RegExp(`${DATE_TOKEN}\\s*–\\s*${DATE_TOKEN}`),
    (s, e) => `${s} – ${e}`,
  );
}

/**
 * Rewrites "Пакет №X «ИИ-робот» Y чатов" from the current package number
 * and chat count. Same anchor-pattern-rebuild approach as period sync —
 * matches both the blank placeholder and an already-filled value.
 * Chat count needs a space (thousand separator, e.g. "2 000"), so its
 * segment allows spaces too, but — critically — excludes the JSON quote
 * character so the match can never cross into a neighbouring text node.
 */
export function syncAvrPackageInBody(
  bodyJson: unknown,
  packageNumber: string,
  chatCount: string,
): unknown {
  if (!packageNumber && !chatCount) return bodyJson;
  const pattern = /Пакет №[\d_]*\s*«ИИ-робот»\s*[\d_ ]+\s*чатов/;
  const text = JSON.stringify(bodyJson);
  if (!pattern.test(text)) return bodyJson;
  const newText = text.replace(
    pattern,
    `Пакет №${packageNumber || "_"} «ИИ-робот» ${chatCount || "_ 000"} чатов`,
  );
  return JSON.parse(newText) as unknown;
}

/**
 * Rewrites `Пакет "ИИ робот" X чатов` (счёт-фактура service line) from the
 * current chat count. Same safe restricted-character-class approach as
 * syncAvrPackageInBody — matches both blank and already-filled state.
 */
export function syncFacturaServiceInBody(bodyJson: unknown, chatCount: string): unknown {
  if (!chatCount) return bodyJson;
  // Литеральные кавычки в тексте («"ИИ робот"») JSON.stringify экранирует как \" —
  // паттерн должен искать именно экранированную форму в сериализованной строке.
  const pattern = /Пакет \\"ИИ робот\\"\s*[\d_ ]+\s*чатов/;
  const text = JSON.stringify(bodyJson);
  if (!pattern.test(text)) return bodyJson;
  const newText = text.replace(pattern, `Пакет \\"ИИ робот\\" ${chatCount || "_ 000"} чатов`);
  return JSON.parse(newText) as unknown;
}

/** Replace the old invoice/act number in the body heading. */
export function syncNumberInBody(
  bodyJson: unknown,
  prevNum: string,
  newNum: string,
): unknown {
  const trimNew = newNum.trim();
  if (!trimNew) return bodyJson;
  const trimOld = prevNum.trim() || "___";
  if (trimOld === trimNew) return bodyJson;

  let text = JSON.stringify(bodyJson);
  text = text.split(`№ ${trimOld}`).join(`№ ${trimNew}`);
  return JSON.parse(text) as unknown;
}

export interface ProviderSettings {
  name: string;
  inn?: string | null;
  bin?: string | null;
  address?: string | null;
  bankAccount?: string | null;
  bankName?: string | null;
  bankBik?: string | null;
}

/**
 * Inject the provider (Поставщик/Исполнитель) details from org settings into the body.
 * Finds the tableRow that contains "Поставщик", "Исполнитель" or "Продавец" and
 * rebuilds the content cell with actual company data.
 */
export function injectProviderInBody(
  bodyJson: unknown,
  settings: ProviderSettings,
): unknown {
  if (!settings.name) return bodyJson;
  // Only inject when we have enough data beyond just the name (INN or bank account).
  // If only the name is set, keep the template's hardcoded content as-is.
  if (!settings.inn && !settings.bankAccount) return bodyJson;

  const PROVIDER_KW = ["Поставщик", "Исполнитель", "Продавец"];
  const isProviderCell = (s: string) => PROVIDER_KW.some((kw) => s.includes(kw));

  function buildContent(): object[] {
    const rows: object[] = [];
    // Company name — bold
    rows.push(para(b(`ОсОО «${settings.name}»`)));
    // INN + ОКПО + address — one paragraph
    const innParts: string[] = [];
    if (settings.inn) {
      innParts.push(settings.bin
        ? `ИНН: ${settings.inn}, ОКПО ${settings.bin}`
        : `ИНН: ${settings.inn}`);
    }
    if (settings.address) innParts.push(`Юридический адрес: ${withCountry(settings.address)}`);
    if (innParts.length) rows.push(para(t(innParts.join(", "))));
    // Bank details — bank name on its own line, then account + BIK
    if (settings.bankAccount || settings.bankName || settings.bankBik) {
      rows.push(para(b("Банковские реквизиты:")));
      if (settings.bankName) rows.push(para(b(settings.bankName)));
      const bankLine = [
        settings.bankAccount ? `Расчетный счет: ${settings.bankAccount}` : null,
        settings.bankBik ? `БИК ${settings.bankBik}` : null,
      ].filter(Boolean).join(", ");
      if (bankLine) rows.push(para(b(bankLine)));
    }
    return rows;
  }

  function traverse(node: unknown): unknown {
    if (typeof node !== "object" || node === null) return node;
    const n = node as Record<string, unknown>;
    if (n.type === "tableRow") {
      const cells = (n.content as unknown[]) ?? [];
      if (cells.length >= 2) {
        const labelIdx = cells.findIndex((c) => {
          if (!isProviderCell(JSON.stringify(c))) return false;
          // Only treat as a label cell if it's short (≤2 paragraphs).
          // A full реквизиты block has many paragraphs and must not be replaced.
          const cellContent = ((c as Record<string, unknown>).content as unknown[]) ?? [];
          return cellContent.length <= 2;
        });
        if (labelIdx >= 0) {
          const contentIdx = labelIdx === 0 ? 1 : 0;
          return {
            ...n,
            content: cells.map((c, i) =>
              i === contentIdx
                ? { ...(c as Record<string, unknown>), content: buildContent() }
                : c,
            ),
          };
        }
      }
    }
    if (n.content) return { ...n, content: (n.content as unknown[]).map(traverse) };
    return n;
  }

  return traverse(bodyJson);
}

export interface CounterpartySettings {
  name: string;
  inn?: string | null;
  bin?: string | null;
  address?: string | null;
  phone?: string | null;
  email?: string | null;
  bankAccount?: string | null;
  bankName?: string | null;
  bankBik?: string | null;
}

/** Заказчик block for AVR — label + full реквизиты share one table cell. */
function buildBuyerBlockAVR(cp: CounterpartySettings): object[] {
  return [
    boldPara("Заказчик:"),
    plainPara(`ОсОО «${cp.name}»`),
    plainPara(
      `Юридический адрес: ${cp.address ? withCountry(cp.address) : "Кыргызская Республика, ________________"}`,
    ),
    plainPara("Почтовый адрес: _________"),
    plainPara(cp.inn ? `ИНН ${cp.inn}` : "ИНН ____________"),
    plainPara(cp.bin ? `ОКПО ${cp.bin}` : "ОКПО ___________"),
    boldPara("Банковские реквизиты:"),
    plainPara(cp.bankAccount ? `р/с ${cp.bankAccount}` : "р/с ______________________"),
    plainPara(cp.bankName ? `в ${cp.bankName}` : "в ОАО «_____________»"),
    plainPara(cp.bankBik ? `БИК ${cp.bankBik}` : "БИК ____________"),
    plainPara("УГКНС:________"),
    emptyPara(),
    plainPara("________________________"),
  ];
}

/** Заказчик block for CONTRACT section 10 — label + full реквизиты share one table cell. */
function buildBuyerBlockContract(cp: CounterpartySettings): object[] {
  return [
    boldPara("Заказчик:"),
    plainPara(`ОсОО «${cp.name}»`),
    plainPara(
      cp.address ? withCountry(cp.address) : "Кыргызская Республика, _____________________________",
    ),
    plainPara(cp.inn ? `ИНН: ${cp.inn}` : "ИНН: ________________"),
    plainPara(cp.bin ? `ОКПО: ${cp.bin}` : "ОКПО: _________________"),
    plainPara("ГНИ: __________________"),
    plainPara(cp.bankName ? `Банк: ${cp.bankName}` : "Банк: ____________________"),
    plainPara(cp.bankBik ? `БИК: ${cp.bankBik}` : "БИК: ______"),
    plainPara(cp.bankAccount ? `Р/с: ${cp.bankAccount}` : "Р/с: _________________"),
    plainPara(cp.email ? `Электронная почта: ${cp.email}` : "Электронная почта: __________________"),
    emptyPara(),
    boldPara("Генеральный директор"),
    plainPara("____________/ ____________"),
    plainPara("/ М.П."),
  ];
}

/** Покупатель content cell for INVOICE_PAYMENT and other label/content-separated layouts. */
function buildBuyerContentDefault(cp: CounterpartySettings): object[] {
  const rows: object[] = [boldPara(`ОсОО «${cp.name}»`)];

  const parts: string[] = [];
  if (cp.inn) parts.push(`ИНН: ${cp.inn}`);
  if (cp.bin) parts.push(`ОКПО: ${cp.bin}`);
  if (cp.address) parts.push(`Юридический адрес: ${withCountry(cp.address)}`);
  if (parts.length) rows.push(plainPara(parts.join(", ")));

  if (cp.bankAccount || cp.bankName || cp.bankBik) {
    rows.push(boldPara("Банковские реквизиты:"));
    if (cp.bankName) rows.push(boldPara(cp.bankName));
    const bankLine = [
      cp.bankAccount ? `Расчетный счет: ${cp.bankAccount}` : null,
      cp.bankBik ? `БИК ${cp.bankBik}` : null,
    ].filter(Boolean).join(", ");
    if (bankLine) rows.push(boldPara(bankLine));
  }

  return rows;
}

/**
 * Inject the counterparty (buyer/Заказчик/Покупатель) details into the body.
 * AVR and CONTRACT keep the label and full реквизиты block in the same table cell;
 * INVOICE_PAYMENT (and others) split label and content into separate cells.
 */
export function injectCounterpartyInBody(
  bodyJson: unknown,
  docType: DocumentType,
  cp: CounterpartySettings,
): unknown {
  if (!cp.name) return bodyJson;

  const BUYER_KW = ["Заказчик", "Покупатель"];
  const hasBuyer = (s: string) => BUYER_KW.some((kw) => s.includes(kw));

  function traverse(node: unknown): unknown {
    if (typeof node !== "object" || node === null) return node;
    const n = node as Record<string, unknown>;

    if (n.type === "tableRow") {
      const cells = (n.content as unknown[]) ?? [];
      const buyerIdx = cells.findIndex((c) => hasBuyer(JSON.stringify(c)));

      if (buyerIdx >= 0) {
        if (docType === DocumentType.AVR) {
          return {
            ...n,
            content: cells.map((c, i) =>
              i === buyerIdx
                ? { ...(c as Record<string, unknown>), content: buildBuyerBlockAVR(cp) }
                : c,
            ),
          };
        }
        if (docType === DocumentType.CONTRACT) {
          return {
            ...n,
            content: cells.map((c, i) =>
              i === buyerIdx
                ? { ...(c as Record<string, unknown>), content: buildBuyerBlockContract(cp) }
                : c,
            ),
          };
        }
        // Separate label/content cells (INVOICE_PAYMENT and others)
        const contentIdx = buyerIdx === 0 ? 1 : 0;
        return {
          ...n,
          content: cells.map((c, i) =>
            i === contentIdx
              ? { ...(c as Record<string, unknown>), content: buildBuyerContentDefault(cp) }
              : c,
          ),
        };
      }
    }

    if (n.content) {
      return { ...n, content: (n.content as unknown[]).map(traverse) };
    }
    return n;
  }

  return traverse(bodyJson);
}
