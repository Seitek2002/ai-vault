const RU_MONTHS = [
  "января","февраля","марта","апреля","мая","июня",
  "июля","августа","сентября","октября","ноября","декабря",
];

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

  const t = (text: string) => ({ type: "text", text });
  const b = (text: string) => ({ type: "text", text, marks: [{ type: "bold" }] });
  const para = (...nodes: object[]) => ({ type: "paragraph", content: nodes });

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

/**
 * Inject the counterparty (buyer/Заказчик) company name into the body.
 * Works for both INVOICE_PAYMENT (label and content in separate cells)
 * and AVR (label and content in the same cell).
 */
export function injectCounterpartyInBody(
  bodyJson: unknown,
  companyName: string,
): unknown {
  const PLACEHOLDER = "ОсОО «______________»";
  const BUYER_KW = ["Заказчик", "Покупатель"];

  function hasBuyer(s: string) {
    return BUYER_KW.some((kw) => s.includes(kw));
  }

  function replaceAll(n: unknown): unknown {
    const s = JSON.stringify(n);
    return JSON.parse(s.split(PLACEHOLDER).join(`ОсОО «${companyName}»`)) as unknown;
  }

  function traverse(node: unknown): unknown {
    if (typeof node !== "object" || node === null) return node;
    const n = node as Record<string, unknown>;

    if (n.type === "tableRow") {
      const cells = (n.content as unknown[]) ?? [];
      const buyerIdx = cells.findIndex((c) => hasBuyer(JSON.stringify(c)));

      if (buyerIdx >= 0) {
        const buyerHasPlaceholder = JSON.stringify(cells[buyerIdx]).includes(PLACEHOLDER);
        return {
          ...n,
          content: cells.map((c, i) =>
            buyerHasPlaceholder
              ? i === buyerIdx ? replaceAll(c) : c   // AVR: replace inside buyer cell
              : i !== buyerIdx ? replaceAll(c) : c,  // Invoice: replace in other cell
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
