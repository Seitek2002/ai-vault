import { describe, expect, it } from 'vitest';
import { esfLineAmounts, esfLinesTotal, esfServiceForPeriod } from './esf';

const line = { name: 'Услуга', unit: 'Штука', gked: '62.02.0', quantity: 1, price: 30000, vatRate: 0, salesTaxRate: 0 };
describe('Суммы и периоды строк ЭСФ', () => {
  it('считает итог двух услуг без перераспределения цены', () => {
    expect(esfLinesTotal([line, { ...line, price: 5000 }])).toBe(35000);
  });
  it('учитывает количество и округляет деньги до копеек', () => {
    expect(esfLineAmounts({ ...line, quantity: 3, price: 0.335 }).total).toBe(1.01);
    expect(esfLinesTotal([{ ...line, price: 0.1 }, { ...line, price: 0.2 }])).toBe(0.3);
  });
  it('сохраняет ставки налогов и отличает цену с налогами', () => {
    expect(esfLineAmounts({ ...line, price: 100, vatRate: 12, salesTaxRate: 2 })).toEqual({ net: 100, vat: 12, salesTax: 2, total: 114 });
    expect(esfLineAmounts({ ...line, price: 114, vatRate: 12, salesTaxRate: 2, priceIncludesTaxes: true })).toEqual({ net: 100, vat: 12, salesTax: 2, total: 114 });
  });
  it.each([NaN, Infinity, -1])('отклоняет недопустимую цену %s', price => {
    expect(() => esfLineAmounts({ ...line, price })).toThrow();
  });
  it.each([
    ['Пакет №1 «ИИ-робот» за период Август 2026', 'Пакет №1 «ИИ-робот» за период октябрь 2026'],
    ['Доступ к чат-центру за август 2026', 'Доступ к чат-центру за октябрь 2026'],
    ['Услуга без периода', 'Услуга без периода — октябрь 2026'],
  ])('обновляет период %s', (name, expected) => expect(esfServiceForPeriod(name, 2026, 10)).toBe(expected));
});
