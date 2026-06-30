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
  } else {
    // Replace the blank placeholder used in all templates
    text = text.split("«___» __________ 202__ г.").join(newFormatted);
  }

  return JSON.parse(text) as unknown;
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
    // INN + ОКПО + address + postal — one paragraph
    const innParts: string[] = [];
    if (settings.inn) {
      innParts.push(settings.bin
        ? `ИНН: ${settings.inn}, код ОКПО: ${settings.bin}`
        : `ИНН: ${settings.inn}`);
    }
    if (settings.address) innParts.push(`Юридический адрес: ${settings.address}`);
    if (innParts.length) rows.push(para(t(innParts.join(", ") + " Почтовый адрес: 720001")));
    // Bank details — bold, one line
    if (settings.bankAccount || settings.bankName || settings.bankBik) {
      rows.push(para(b("Банковские реквизиты:")));
      const bankLine = [
        settings.bankAccount ? `Расчетный счет ${settings.bankAccount}` : null,
        settings.bankName ? settings.bankName : null,
        settings.bankBik ? `БИК банка ${settings.bankBik}` : null,
      ].filter(Boolean).join("  ");
      rows.push(para(b(bankLine)));
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
  const rows: object[] = [plainPara(`ОсОО «${cp.name}»`)];

  const parts: string[] = [];
  if (cp.inn) parts.push(`ИНН: ${cp.inn}`);
  if (cp.bin) parts.push(`ОКПО: ${cp.bin}`);
  if (cp.address) parts.push(`Юридический адрес: ${withCountry(cp.address)}`);
  if (parts.length) rows.push(plainPara(`${parts.join(", ")} Почтовый адрес: ______`));

  if (cp.bankAccount || cp.bankName || cp.bankBik) {
    const bankParts = [
      cp.bankAccount ? `р/с: ${cp.bankAccount}` : null,
      cp.bankName ?? null,
      cp.bankBik ? `БИК: ${cp.bankBik}` : null,
    ].filter(Boolean).join(", ");
    rows.push(plainPara(`${bankParts}, УГКНС: ___ ККН`));
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
