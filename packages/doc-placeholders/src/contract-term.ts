export type ContractTermUnit = 'MONTHS' | 'YEARS';

/** Calendar arithmetic: January 31 + one month ends on February's last day. */
export function calculateContractEndDate(start: string, value: number, unit: ContractTermUnit): string | null {
  const date = start.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isInteger(value) || value < 1 ||
      !['MONTHS', 'YEARS'].includes(unit) || value > (unit === 'YEARS' ? 100 : 1200)) return null;
  const source = new Date(`${date}T00:00:00.000Z`);
  if (Number.isNaN(source.getTime()) || source.toISOString().slice(0, 10) !== date) return null;
  const target = new Date(source);
  target.setUTCDate(1);
  target.setUTCMonth(target.getUTCMonth() + value * (unit === 'YEARS' ? 12 : 1));
  if (target.getUTCFullYear() > 9999) return null;
  const lastDay = new Date(target);
  lastDay.setUTCMonth(lastDay.getUTCMonth() + 1);
  lastDay.setUTCDate(0);
  target.setUTCDate(Math.min(source.getUTCDate(), lastDay.getUTCDate()));
  return target.toISOString().slice(0, 10);
}
