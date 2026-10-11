import { describe, expect, it } from 'vitest';
import { applyEsfPeriod, esfLineBase, esfPeriodOptions, newEsfLine, parsePeriodValue, periodValue, reviewEsfLines } from '../esf-draft';

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

describe('Период услуг в строках ЭСФ', () => {
  it('меняет месяц в названиях, сохраняя правки менеджера', () => {
    const rows = [
      { name: 'Пакет №1 «ИИ-робот» за период октябрь 2026', quantity: '1', price: '30000' },
      { name: 'Доступ к чат-центру', quantity: '1', price: '5000' },
    ];
    expect(applyEsfPeriod(rows, { year: 2026, month: 9 })).toEqual([
      { name: 'Пакет №1 «ИИ-робот» за период сентябрь 2026', quantity: '1', price: '30000' },
      { name: 'Доступ к чат-центру — сентябрь 2026', quantity: '1', price: '5000' },
    ]);
  });

  it('не плодит периоды при повторной смене', () => {
    const once = applyEsfPeriod([{ name: 'Услуга', quantity: '1', price: '1' }], { year: 2026, month: 9 });
    expect(applyEsfPeriod(once, { year: 2026, month: 8 })[0]!.name).toBe('Услуга — август 2026');
  });

  it('предлагает расчётный месяц и год до него', () => {
    const options = esfPeriodOptions({ year: 2026, month: 10 });
    expect(options).toHaveLength(13);
    expect(options[0]).toEqual({ value: '2026-10', label: 'октябрь 2026' });
    expect(options[1]).toEqual({ value: '2026-09', label: 'сентябрь 2026' });
    expect(options[10]).toEqual({ value: '2025-12', label: 'декабрь 2025' });
  });

  it('переводит период в значение списка и обратно', () => {
    expect(periodValue({ year: 2026, month: 9 })).toBe('2026-09');
    expect(parsePeriodValue('2026-09')).toEqual({ year: 2026, month: 9 });
  });
});

describe('Добавление и удаление строк ЭСФ', () => {
  const sample = [
    { name: 'Пакет №1', unit: 'Штука', gked: '62.02.0', quantity: 1, price: 30000, vatRate: 0, salesTaxRate: 0 },
    { name: 'Чат-центр', unit: 'Месяц', gked: '63.11.0', quantity: 1, price: 5000, vatRate: 0, salesTaxRate: 0 },
  ];

  it('новая строка берёт единицу и ГКЭД первой услуги', () => {
    expect(newEsfLine(sample)).toEqual({ name: '', quantity: '1', price: '', unit: 'Штука', gked: '62.02.0' });
  });

  it('строка образца опирается на свою строку, даже если порядок сменился', () => {
    expect(esfLineBase(sample, { name: 'x', quantity: '1', price: '1', source: 1 })?.unit).toBe('Месяц');
  });

  it('сверяет сумму с добавленной строкой и без удалённой', () => {
    const rows = [
      { name: 'Чат-центр', quantity: '1', price: '5000', source: 1 },
      { name: 'Интеграция', quantity: '1', price: '30000', unit: 'Услуга', gked: '62.01.0' },
    ];
    const reviewed = reviewEsfLines(sample, rows, 35000);
    expect(reviewed.error).toBe('');
    expect(reviewed.lines.map((l) => [l.name, l.unit, l.gked])).toEqual([['Чат-центр', 'Месяц', '63.11.0'], ['Интеграция', 'Услуга', '62.01.0']]);
  });

  it('требует единицу и ГКЭД у добавленной строки', () => {
    expect(reviewEsfLines(sample, [{ name: 'X', quantity: '1', price: '35000', unit: '', gked: '62.02.0' }], 35000).error).toMatch(/единицу/);
    expect(reviewEsfLines(sample, [{ name: 'X', quantity: '1', price: '35000', unit: 'Штука', gked: '62' }], 35000).error).toMatch(/ГКЭД/);
  });

  it('не даёт отправить ЭСФ без строк', () => {
    expect(reviewEsfLines(sample, [], 35000).error).toMatch(/хотя бы одну/);
  });
});
