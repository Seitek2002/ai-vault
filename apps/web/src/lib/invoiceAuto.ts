import { DocumentType } from "@ai-vault/types";
import { documentsApi } from "./api/documents";
import { todayISO } from "./docBody";

/** «2.06.26 г.» — короткий формат для периода услуг */
function shortRu(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return `${d}.${String(m).padStart(2, "0")}.${String(y).slice(2)} г.`;
}

function monthAgoISO(): string {
  const d = new Date();
  d.setMonth(d.getMonth() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export interface InvoiceAutoFields {
  /** Следующий номер счёта: максимум существующих + 1, с ведущими нулями («005») */
  number: string;
  /** Период услуг: от даты последнего счёта до сегодня */
  periodStart: string;
  periodEnd: string;
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

  return {
    number: String(next).padStart(3, "0"),
    periodStart: shortRu(startIso),
    periodEnd: shortRu(todayISO()),
  };
}
