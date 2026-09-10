/** Календарная арифметика расчётного месяца. Всё в UTC — сроки не должны
 *  съезжать на день от часового пояса сервера. */

const MONTHS_NOM = [
  'январь', 'февраль', 'март', 'апрель', 'май', 'июнь',
  'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь',
];

/** Первый день месяца (`month` — 1..12). */
export function firstDayOfMonth(year: number, month: number): Date {
  return new Date(Date.UTC(year, month - 1, 1, 0, 0, 0, 0));
}

/** Последний день месяца (`month` — 1..12). */
export function lastDayOfMonth(year: number, month: number): Date {
  return new Date(Date.UTC(year, month, 0, 0, 0, 0, 0));
}

/** Не мутирует исходную дату. */
export function addDays(date: Date, days: number): Date {
  const d = new Date(date.getTime());
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

/** «сентябрь 2026 г.» */
export function periodLabel(year: number, month: number): string {
  return `${MONTHS_NOM[month - 1] ?? ''} ${year} г.`;
}

/** YYYY-MM-DD — формат, который ждёт подстановка плейсхолдеров. */
export function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}
