/** Parse a user entered amount without turning a blank value into zero. */
export function parseMoneyInput(value: string): number | null {
  const normalized = value.replace(/[\s\u00a0\u202f]/g, '').replace(',', '.');
  if (!/^\d+(?:\.\d{0,2})?$/.test(normalized)) return null;
  const amount = Number(normalized);
  return Number.isFinite(amount) && amount <= 999999999999.99 ? amount : null;
}
