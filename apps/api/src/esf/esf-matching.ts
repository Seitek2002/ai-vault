import { EsfStatus } from '@prisma/client';

/**
 * Чистая логика сопоставления ЭСФ с расчётом. Без БД — ради тестов.
 */

/** ИНН «розничной» ЭСФ (ККМ / реализация населению) — это не контрагент. */
export const RETAIL_INN = '99999999999999';

/** Статусы портала → наш enum. Неизвестное слово не роняет синхронизацию. */
export function mapPortalStatus(raw: string): EsfStatus {
  const s = raw.trim().toLowerCase();
  if (s === 'принят') return EsfStatus.ACCEPTED;
  if (s === 'отправлен') return EsfStatus.SENT;
  if (s === 'новый') return EsfStatus.NEW;
  if (s === 'отозван') return EsfStatus.REVOKED;
  if (s.startsWith('отклон')) return EsfStatus.REJECTED;
  return EsfStatus.UNKNOWN;
}

/** Только эти статусы означают, что ЭСФ действительно выставлена. */
export function statusClosesStep(status: EsfStatus): boolean {
  return status === EsfStatus.ACCEPTED || status === EsfStatus.SENT;
}

/** «30 000,00» / «1 826 000,00» → 1826000 */
export function parsePortalAmount(raw: string): number | null {
  const cleaned = raw.replace(/[\s ]/g, '').replace(',', '.');
  if (!/^\d+(\.\d+)?$/.test(cleaned)) return null;
  return Number(cleaned);
}

/** dd.mm.yyyy или dd-mm-yyyy → Date (UTC, полночь). */
export function parsePortalDate(raw: string | null | undefined): Date | null {
  if (!raw) return null;
  const m = raw.trim().match(/^(\d{2})[.-](\d{2})[.-](\d{4})$/);
  if (!m) return null;
  const [, dd, mm, yyyy] = m;
  const d = new Date(Date.UTC(Number(yyyy), Number(mm) - 1, Number(dd)));
  return Number.isNaN(d.getTime()) ? null : d;
}

export interface SettlementCandidate {
  id: string;
  year: number;
  month: number;
  amount: number;
  /** Номера документов расчёта (акт, счёт) — для точного совпадения по crmRef */
  documentNumbers: string[];
  /** Уже ли на этом расчёте висит другая ЭСФ */
  hasEsf: boolean;
}

export interface MatchInput {
  crmRef: string | null;
  deliveryDate: Date | null;
  amount: number;
}

export type MatchResult =
  | { kind: 'matched'; settlementId: string; how: 'crmRef' | 'month+amount' }
  | { kind: 'ambiguous'; note: string }
  | { kind: 'none'; note: string };

/**
 * Приоритет совпадений:
 *  1. crmRef равен номеру нашего документа — однозначно, месяц и сумма не важны;
 *  2. месяц поставки + точная сумма — обычный случай;
 *  3. месяц поставки и в нём ровно один расчёт без ЭСФ — сумма расходится,
 *     но выбирать не из чего; отмечаем «how: month», менеджер увидит.
 * Расчёты, на которых уже есть ЭСФ, кандидатами не считаются.
 */
export function matchSettlement(input: MatchInput, candidates: SettlementCandidate[]): MatchResult {
  if (input.crmRef) {
    const ref = input.crmRef.trim().toLowerCase();
    const byRef = candidates.filter((c) =>
      c.documentNumbers.some((n) => n.trim().toLowerCase() === ref),
    );
    if (byRef.length === 1) {
      const c = byRef[0]!;
      if (Math.abs(c.amount - input.amount) < 0.01) return { kind: 'matched', settlementId: c.id, how: 'crmRef' };
      return {
        kind: 'none',
        note: `Номер акта совпал, но сумма ЭСФ ${fmt(input.amount)} ≠ сумме расчёта ${fmt(c.amount)}`,
      };
    }
  }

  if (!input.deliveryDate) {
    return { kind: 'none', note: 'В ЭСФ нет даты поставки — месяц не определить' };
  }

  const year = input.deliveryDate.getUTCFullYear();
  const month = input.deliveryDate.getUTCMonth() + 1;
  const inMonth = candidates.filter((c) => c.year === year && c.month === month && !c.hasEsf);

  if (inMonth.length === 0) {
    const taken = candidates.some((c) => c.year === year && c.month === month && c.hasEsf);
    return {
      kind: 'none',
      note: taken
        ? `За ${String(month).padStart(2, '0')}.${year} у партнёра уже есть ЭСФ`
        : `Нет расчёта за ${String(month).padStart(2, '0')}.${year} по этому партнёру`,
    };
  }

  const sameAmount = inMonth.filter((c) => Math.abs(c.amount - input.amount) < 0.01);
  if (sameAmount.length === 1) {
    return { kind: 'matched', settlementId: sameAmount[0]!.id, how: 'month+amount' };
  }
  if (sameAmount.length > 1) {
    return { kind: 'ambiguous', note: 'Несколько расчётов за месяц с такой же суммой' };
  }

  // Сумма ЭСФ обязана совпадать с суммой расчёта: без этого не привязываем
  // даже единственный расчёт месяца — пусть решает человек.
  if (inMonth.length === 1) {
    return {
      kind: 'none',
      note: `Сумма ЭСФ ${fmt(input.amount)} ≠ сумме расчёта ${fmt(inMonth[0]!.amount)}`,
    };
  }
  return { kind: 'ambiguous', note: 'Несколько расчётов за месяц, сумма ни с одним не совпала' };
}

function fmt(n: number): string {
  return n.toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/**
 * Наименование без юридической формы, кавычек и лишних пробелов — чтобы
 * «Общество с ограниченной ответственностью "Кей Джи Лотерея"» с портала
 * совпало с «ОсОО «Кей Джи Лотерея»» из карточки.
 */
export function normalizeCompanyName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[«»"'“”„]/g, ' ')
    // \b в JS не знает кириллицы — границы слова через юникодные lookaround.
    .replace(
      /(?<![\p{L}\p{N}])(общество с ограниченной ответственностью|открытое акционерное общество|закрытое акционерное общество|общественный фонд|индивидуальный предприниматель|осоо|ооо|оао|зао|ао|оф|ип|тоо|чп)(?![\p{L}\p{N}])/gu,
      ' ',
    )
    .replace(/[()]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
