/** Contract date is a calendar date; creation timestamps use the business timezone. */
export function contractNumberPeriod(startDate?: string | Date | null, createdAt = new Date()): string {
  if (startDate) {
    const date = new Date(startDate);
    if (!Number.isNaN(date.getTime())) {
      return `${String(date.getUTCMonth() + 1).padStart(2, '0')}${String(date.getUTCFullYear()).slice(-2)}`;
    }
  }
  const parts = new Intl.DateTimeFormat('en', {
    timeZone: 'Asia/Bishkek', month: '2-digit', year: '2-digit',
  }).formatToParts(createdAt);
  return `${parts.find((part) => part.type === 'month')!.value}${parts.find((part) => part.type === 'year')!.value}`;
}

/** Preserve an explicitly supplied MMYY suffix and keep normalization idempotent. */
export function formatContractNumber(number: string, startDate?: string | Date | null, createdAt = new Date()): string {
  const trimmed = number.trim();
  if (/\/(0[1-9]|1[0-2])\d{2}$/.test(trimmed)) return trimmed;
  return `${trimmed.replace(/\/+$/, '')}/${contractNumberPeriod(startDate, createdAt)}`;
}

/**
 * Номер для внешних документов: «ДГ-000003/0326» → «ДГ-0003/0326».
 * В Vault счётчик печатает шесть цифр, а в договорах и на портале ЭСФ номер
 * пишется короче — четырьмя. Суффикс месяца и года сохраняется, чужие форматы
 * («022/0926», «Klot-027/0226») не трогаем.
 */
export function shortContractNumber(number: string): string {
  return number.trim().replace(/\d{5,}/g, (digits) => {
    const trimmed = digits.replace(/^0+/, '') || '0';
    return trimmed.length >= 4 ? trimmed : trimmed.padStart(4, '0');
  });
}
