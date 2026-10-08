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
