import { describe, expect, it } from 'vitest';
import { reviewEsfLines } from '../esf-draft';

const template = [
  { name: 'Робот', unit: 'Штука', gked: '62.02.0', quantity: 1, price: 30000, vatRate: 0, salesTaxRate: 0 },
  { name: 'Чат-центр', unit: 'Штука', gked: '62.02.0', quantity: 1, price: 5000, vatRate: 0, salesTaxRate: 0 },
];
const input = template.map(line => ({ name: line.name, quantity: String(line.quantity), price: String(line.price) }));
describe('Проверка редактора услуг ЭСФ', () => {
  it('принимает 2 строки на общую сумму расчёта', () => {
    expect(reviewEsfLines(template, input, 35000).error).toBe('');
  });
  it('разрешает запятую и пробелы в суммах', () => {
    expect(reviewEsfLines(template, [{ ...input[0]!, quantity: '2', price: '15 000,00' }, input[1]!], 35000).total).toBe(35000);
  });
  it('показывает несовпадение суммы расчёта', () => {
    expect(reviewEsfLines(template, input, 35001).error).toContain('отличается');
  });
  it.each(['', '-1', '0', 'NaN', '1.123456', '1e5', '1000000001'])('отклоняет цену %s', price => {
    expect(reviewEsfLines(template, [{ ...input[0]!, price }, input[1]!], 35000).error).not.toBe('');
  });
});
