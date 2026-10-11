import { describe, expect, it } from 'vitest';
import { esfDefaultNote, esfLineAmounts, esfLinesTotal, esfPeriodLabel, esfReplacePeriod, esfServiceForPeriod, esfSuggestedPeriod } from './esf';

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

describe('Период услуг по умолчанию', () => {
  const at = (iso: string) => new Date(`${iso}T09:00:00Z`);
  it('в октябре предлагает сентябрь — месяц ещё не закончился', () => {
    expect(esfSuggestedPeriod(2026, 10, at('2026-10-11'))).toEqual({ year: 2026, month: 9 });
  });
  it('расчёту за прошлый месяц оставляет его собственный период', () => {
    expect(esfSuggestedPeriod(2026, 9, at('2026-10-11'))).toEqual({ year: 2026, month: 9 });
    expect(esfSuggestedPeriod(2026, 8, at('2026-10-11'))).toEqual({ year: 2026, month: 8 });
  });
  it('в январе предлагает декабрь прошлого года', () => {
    expect(esfSuggestedPeriod(2027, 1, at('2027-01-05'))).toEqual({ year: 2026, month: 12 });
  });
  it('подписывает период по-русски', () => {
    expect(esfPeriodLabel({ year: 2026, month: 9 })).toBe('сентябрь 2026');
  });
});

describe('Примечание ЭСФ', () => {
  it('по умолчанию — договор и период', () => {
    expect(esfDefaultNote(' Пакет на ИИ чат-бота Aivio ', 2026, 9)).toBe('Пакет на ИИ чат-бота Aivio — сентябрь 2026');
  });
  it('при смене периода меняет месяц в тексте менеджера', () => {
    expect(esfReplacePeriod('Акт оказанных услуг за сентябрь 2026', 2026, 8)).toBe('Акт оказанных услуг за август 2026');
  });
  it('ничего не дописывает, если месяца в тексте нет', () => {
    expect(esfReplacePeriod('Акт оказанных услуг от 30.09.2026 г.', 2026, 8)).toBe('Акт оказанных услуг от 30.09.2026 г.');
  });
  it('старое поведение названий услуг сохранено', () => {
    expect(esfServiceForPeriod('Услуга без периода', 2026, 10)).toBe('Услуга без периода — октябрь 2026');
    expect(esfServiceForPeriod('Пакет за август 2026', 2026, 9)).toBe('Пакет за сентябрь 2026');
  });
});
