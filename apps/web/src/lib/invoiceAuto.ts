import { DocumentType } from "@ai-vault/types";
import { documentsApi } from "./api/documents";
import { todayISO, shortPeriodDate } from "./docBody";

function monthAgoISO(): string {
  const d = new Date();
  d.setMonth(d.getMonth() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export interface InvoiceAutoFields {
  /** Следующий номер счёта: максимум существующих + 1, с ведущими нулями («005») */
  number: string;
  /** Период услуг («5.07.26 г.»): от даты последнего счёта до сегодня */
  periodStart: string;
  periodEnd: string;
  /** Те же даты периода в ISO — сохраняются в meta для редактирования в панели */
  periodStartIso: string;
  periodEndIso: string;
}

/**
 * Автополя для нового «Счёта на оплату»: следующий номер и период услуг,
 * рассчитанные по последнему созданному счёту. Если счетов ещё нет —
 * нумерация начинается с 005, период = последний месяц.
 */
export async function computeInvoiceAutoFields(): Promise<InvoiceAutoFields> {
  const res = await documentsApi
    .list({ type: DocumentType.INVOICE_PAYMENT, limit: 100 })
    .catch(() => null);
  const docs = res?.data ?? [];

  const numbers = docs
    .map((d) => parseInt(String((d.meta as unknown as Record<string, unknown>)?.invoiceNumber ?? ""), 10))
    .filter((n) => Number.isFinite(n) && n > 0);
  const next = numbers.length ? Math.max(...numbers) + 1 : 5;

  const last = docs[0];
  const lastMeta = (last?.meta ?? {}) as unknown as Record<string, unknown>;
  const startIso =
    (typeof lastMeta.invoiceDate === "string" && lastMeta.invoiceDate) ||
    (last?.createdAt ? last.createdAt.slice(0, 10) : "") ||
    monthAgoISO();

  const endIso = todayISO();
  return {
    number: String(next).padStart(3, "0"),
    periodStart: shortPeriodDate(startIso),
    periodEnd: shortPeriodDate(endIso),
    periodStartIso: startIso,
    periodEndIso: endIso,
  };
}
