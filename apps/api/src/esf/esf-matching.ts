import { createHash } from 'node:crypto';
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

const LEGACY_REF_PREFIX = 'ErkinAI.Docs-';
const REF_PREFIX = 'ED-';
/** Crockford base32: без I, L, O, U — не спутать при переписывании. */
const REF_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

export interface RefSettlement {
  id: string;
  year: number;
  month: number;
}

/**
 * «Номер учётной системы» в ЭСФ: «ED-2609-K7Q2MX» — месяц расчёта и шесть
 * знаков, однозначно выведенных из его id. Различает договоры и несколько
 * комплектов в одном месяце, но помещается в поле портала и читается глазами.
 */
export function esfAccountingRef(settlement: RefSettlement): string {
  const digest = createHash('sha256').update(settlement.id).digest();
  let code = '';
  for (let i = 0; i < 6; i++) code += REF_ALPHABET[digest[i]! % 32];
  const period = `${String(settlement.year % 100).padStart(2, '0')}${String(settlement.month).padStart(2, '0')}`;
  return `${REF_PREFIX}${period}-${code}`;
}

/** Так Vault подписывал ЭСФ раньше — полный id расчёта. Такие ЭСФ уже на портале. */
export function legacyAccountingRef(settlementId: string): string {
  return `${LEGACY_REF_PREFIX}${settlementId}`;
}

export function isAccountingRef(ref: string): boolean {
  const value = ref.trim();
  return value.toLowerCase().startsWith(LEGACY_REF_PREFIX.toLowerCase()) || /^ED-\d{4}-[0-9A-Z]{6}$/i.test(value);
}

export interface SettlementCandidate {
  id: string;
  year: number;
  month: number;
  amount: number;
  /** Название договора — у партнёра их может быть несколько */
  contractTitle: string;
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
 *  1. crmRef содержит наш ID расчёта или прежний номер документа + точная сумма;
 *  2. месяц поставки + точная сумма — обычный случай;
 *  3. при разнице сумм или неоднозначном совпадении выбирает менеджер.
 * Расчёты, на которых уже есть ЭСФ, кандидатами не считаются.
 */
export function matchSettlement(input: MatchInput, candidates: SettlementCandidate[]): MatchResult {
  if (input.crmRef) {
    const ref = input.crmRef.trim().toLowerCase();
    const systemRef = isAccountingRef(ref);
    const byRef = candidates.filter((c) => systemRef
      ? [esfAccountingRef(c), legacyAccountingRef(c.id)].some((own) => own.toLowerCase() === ref)
      : c.documentNumbers.some((n) => n.trim().toLowerCase() === ref));
    if (systemRef && byRef.length === 0) {
      return { kind: 'none', note: 'Расчёт из номера учётной системы ErkinAI.Docs не найден у этого партнёра' };
    }
    if (byRef.length === 1) {
      const c = byRef[0]!;
      if (c.hasEsf) return { kind: 'none', note: 'К расчёту из номера учётной системы уже привязана другая ЭСФ' };
      if (Math.abs(c.amount - input.amount) < 0.01) return { kind: 'matched', settlementId: c.id, how: 'crmRef' };
      return {
        kind: 'none',
        note: `${systemRef ? 'Номер учётной системы' : 'Номер акта'} совпал, но сумма ЭСФ ${fmt(input.amount)} ≠ сумме расчёта ${fmt(c.amount)}`,
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
    // Несколько комплектов с одинаковой суммой — выбрать может только человек.
    return {
      kind: 'ambiguous',
      note: `Несколько расчётов с суммой ${fmt(input.amount)}: ${sameAmount.map((c) => c.contractTitle).join(', ')}`,
    };
  }

  // Сумма ЭСФ обязана совпадать с суммой расчёта: без этого не привязываем
  // даже единственный расчёт месяца — пусть решает человек.
  if (inMonth.length === 1) {
    return {
      kind: 'none',
      note: `Сумма ЭСФ ${fmt(input.amount)} ≠ сумме расчёта ${fmt(inMonth[0]!.amount)}`,
    };
  }
  return {
    kind: 'ambiguous',
    note: `Сумма ЭСФ ${fmt(input.amount)} не совпала ни с одним расчётом месяца: ${inMonth
      .map((c) => `${c.contractTitle} ${fmt(c.amount)}`)
      .join(', ')}`,
  };
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
