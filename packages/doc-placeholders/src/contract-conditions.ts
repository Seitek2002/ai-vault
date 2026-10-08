export type ContractBillingPeriod = 'MONTHLY' | 'YEARLY' | 'ONE_TIME';
export const CONTRACT_PAYMENT_LABELS: Record<ContractBillingPeriod, string> = {
  MONTHLY: 'Ежемесячный платёж', YEARLY: 'Ежегодный платёж', ONE_TIME: 'Разовый платёж',
};
export const CONTRACT_AMOUNT_LABELS: Record<ContractBillingPeriod, string> = {
  MONTHLY: 'в месяц', YEARLY: 'в год', ONE_TIME: 'разово',
};
type DateValue = Date | string | null | undefined;
export interface ContractSchedule {
  active: boolean; billingPeriod?: ContractBillingPeriod; autoRenew?: boolean;
  startDate?: DateValue; endDate?: DateValue; createdAt?: DateValue; terminationDate?: DateValue;
  termValue?: number | null; termUnit?: 'MONTHS' | 'YEARS' | null;
}
const asDate = (value: DateValue) => value ? new Date(value) : null;
const renewMonths = (start: Date, months: number) => {
  const target = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + months, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(start.getUTCDate(), lastDay));
  return target;
};
/** Resolve renewal without rewriting the signed contract's original dates. */
export function effectiveContractEndDate(contract: ContractSchedule, at = new Date()): string | null {
  const start = asDate(contract.startDate), end = asDate(contract.endDate);
  if (!end) return null;
  if (!contract.autoRenew || !start || end <= start || at <= end || contract.terminationDate) return end.toISOString().slice(0, 10);
  const months = (contract.termValue ?? 0) * (contract.termUnit === 'YEARS' ? 12 : 1);
  if (months > 0) {
    const elapsedMonths = (at.getUTCFullYear() - start.getUTCFullYear()) * 12 + at.getUTCMonth() - start.getUTCMonth();
    let periods = Math.max(1, Math.floor(elapsedMonths / months));
    let result = renewMonths(start, periods * months);
    if (result < at) result = renewMonths(start, ++periods * months);
    return result.toISOString().slice(0, 10);
  }
  const duration = end.getTime() - start.getTime();
  const periods = Math.max(1, Math.ceil((at.getTime() - start.getTime()) / duration));
  return new Date(start.getTime() + periods * duration).toISOString().slice(0, 10);
}
export function contractBillsInMonth(contract: ContractSchedule, year: number, month: number): boolean {
  if (!contract.active || contract.terminationDate || !Number.isInteger(month) || month < 1 || month > 12) return false;
  const from = new Date(Date.UTC(year, month - 1, 1));
  const through = new Date(Date.UTC(year, month, 0));
  const start = asDate(contract.startDate);
  if (start && start > through) return false;
  const end = effectiveContractEndDate(contract, from);
  if (end && new Date(end) < from) return false;
  const anchor = start ?? asDate(contract.createdAt);
  if ((contract.billingPeriod ?? 'MONTHLY') === 'YEARLY') return !!anchor && anchor.getUTCMonth() === month - 1;
  return true;
}
