/** Editable service amounts; catalogue references and tax rates come from the portal. */
export interface EsfDraftLine {
  name: string;
  quantity: number;
  price: number;
  unit: string;
  gked: string;
  vatRate: number;
  salesTaxRate: number;
  priceIncludesTaxes?: boolean;
}

export interface EsfLineAmounts {
  net: number;
  vat: number;
  salesTax: number;
  total: number;
}

function scaled(value: number): bigint {
  if (!Number.isFinite(value) || value < 0 || value > 999999999999) throw new Error('Недопустимое число в строке ЭСФ.');
  return BigInt(value.toFixed(5).replace('.', ''));
}

function roundDiv(value: bigint, divisor: bigint): bigint {
  return (value + divisor / 2n) / divisor;
}

/** Round each monetary column to cents, without binary float accumulation. */
export function esfLineAmounts(line: Pick<EsfDraftLine, 'quantity' | 'price' | 'vatRate' | 'salesTaxRate' | 'priceIncludesTaxes'>): EsfLineAmounts {
  const cost = roundDiv(scaled(line.quantity) * scaled(line.price), 100000000n);
  const net = line.priceIncludesTaxes ? roundDiv(cost * 10000000n, 10000000n + scaled(line.vatRate) + scaled(line.salesTaxRate)) : cost;
  const vat = roundDiv(net * scaled(line.vatRate), 10000000n);
  const salesTax = roundDiv(net * scaled(line.salesTaxRate), 10000000n);
  const total = net + vat + salesTax;
  if (total > 99999999999999n) throw new Error('Сумма строки ЭСФ слишком большая.');
  return { net: Number(net) / 100, vat: Number(vat) / 100, salesTax: Number(salesTax) / 100, total: Number(total) / 100 };
}

export function esfLinesTotal(lines: readonly EsfDraftLine[]): number {
  const cents = lines.reduce((sum, line) => sum + BigInt(Math.round(esfLineAmounts(line).total * 100)), 0n);
  if (cents > 99999999999999n) throw new Error('Общая сумма ЭСФ слишком большая.');
  return Number(cents) / 100;
}

const MONTHS = ['январь', 'февраль', 'март', 'апрель', 'май', 'июнь', 'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь'];

/** Refresh an explicit month/year in the service title; never infer price allocation. */
export function esfServiceForPeriod(name: string, year: number, month: number): string {
  const period = `${MONTHS[month - 1]} ${year}`;
  const re = /(?:январ[ья]|феврал[ья]|март[а]?|апрел[ья]|ма[йя]|июн[ья]|июл[ья]|август[а]?|сентябр[ья]|октябр[ья]|ноябр[ья]|декабр[ья])\s+20\d{2}/gi;
  return re.test(name) ? name.replace(re, period) : `${name.trim()} — ${period}`;
}
