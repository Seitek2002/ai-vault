/**
 * Форматтеры дат и сумм для подстановки плейсхолдеров.
 *
 * Это перенос из `apps/web/src/lib/docBody.ts` — оттуда их брал
 * `placeholders.ts`. Пакет собирается в JS, поэтому подстановка доступна и
 * бэкенду (генерация документов по расчёту), а не только браузеру.
 * `docBody.ts` продолжает держать свои копии для остального кода фронта.
 */

const RU_MONTHS = [
  'января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
  'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря',
];

/** «5 июля 2026 г.» */
export function ruDate(d: Date): string {
  return `${d.getDate()} ${RU_MONTHS[d.getMonth()]} ${d.getFullYear()} г.`;
}

/** «6.07.2026» — числовой формат */
export function shortNumericDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return `${d}.${String(m).padStart(2, '0')}.${y}`;
}

/** «6.07.26 г.» — короткий формат для периода услуг в таблице */
export function shortPeriodDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return `${d}.${String(m).padStart(2, '0')}.${String(y).slice(2)} г.`;
}

export function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** «20 000,00» — денежный формат как в счёте */
export function formatAmount(n: number): string {
  const [int, frac] = n.toFixed(2).split('.');
  return `${int!.replace(/\B(?=(\d{3})+(?!\d))/g, ' ')},${frac}`;
}

/** Заглушка суммы в шаблоне счёта — заменяется при вводе суммы */
export const AMOUNT_PLACEHOLDER = '__ 000,00';
