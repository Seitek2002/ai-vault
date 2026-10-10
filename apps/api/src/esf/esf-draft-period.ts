import { esfDeliveryDate, esfSuggestedPeriod, type EsfPeriod } from '@ai-vault/doc-placeholders';

/**
 * Период услуг черновика ЭСФ и дата поставки. Чистая арифметика — без БД,
 * чтобы правила «не позже расчётного месяца» и «не в будущем» были под тестами.
 */

export interface DraftPeriodInput {
  periodYear?: number;
  periodMonth?: number;
  /** yyyy-mm-dd */
  deliveryDate?: string;
}

const index = (period: EsfPeriod): number => period.year * 12 + period.month - 1;
const monthNow = (today: Date): number => today.getUTCFullYear() * 12 + today.getUTCMonth();

/** Менеджер мог выбрать период сам; иначе — предыдущий завершившийся месяц. */
export function draftPeriod(settlement: EsfPeriod, dto: DraftPeriodInput | undefined, today: Date): EsfPeriod {
  if (dto?.periodYear == null || dto.periodMonth == null) {
    return esfSuggestedPeriod(settlement.year, settlement.month, today);
  }
  return { year: dto.periodYear, month: dto.periodMonth };
}

export function draftPeriodError(settlement: EsfPeriod, period: EsfPeriod, today: Date): string | null {
  const limit = Math.min(monthNow(today), index(settlement));
  if (index(period) > limit) return 'Период услуг не может быть позже расчётного месяца и текущего месяца.';
  if (index(period) < index(settlement) - 24) return 'Период услуг старше двух лет — проверьте расчёт.';
  return null;
}

/** Конец периода услуг, но не позже сегодняшнего дня — то же, что видит менеджер. */
export function draftDeliveryDate(period: EsfPeriod, today: Date): string {
  return esfDeliveryDate(period, today);
}

export function draftDeliveryError(period: EsfPeriod, deliveryDate: string, today: Date): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(deliveryDate)) return 'Дата поставки указана неверно.';
  const date = new Date(`${deliveryDate}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return 'Дата поставки указана неверно.';
  const day = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
  if (date > day) return 'Дата поставки не может быть в будущем.';
  if (date < new Date(Date.UTC(period.year, period.month - 1, 1))) return 'Дата поставки раньше периода услуг.';
  return null;
}

export function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** yyyy-mm-dd → dd-mm-yyyy, как ждёт портал. */
export function portalDate(iso: string): string {
  const [year, month, day] = iso.split('-');
  return `${day}-${month}-${year}`;
}
