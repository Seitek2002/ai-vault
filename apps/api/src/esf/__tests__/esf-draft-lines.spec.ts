import { describe, expect, it } from 'vitest';
import { DraftLinesError, linesFollowTemplate, mergeDraftLines } from '../esf-draft-lines';

const template = [
  { name: 'Пакет №1 «ИИ-робот» за август 2026', quantity: 1, price: 30000, unit: 'Штука', gked: '62.02.0', vatRate: 0, salesTaxRate: 0, priceIncludesTaxes: false },
  { name: 'Доступ к чат-центру за август 2026', quantity: 1, price: 5000, unit: 'Месяц', gked: '63.11.0', vatRate: 12, salesTaxRate: 2, priceIncludesTaxes: false },
];

describe('Строки новой ЭСФ', () => {
  it('строки образца берут из него единицу, ГКЭД и ставки', () => {
    const lines = mergeDraftLines(template, [
      { name: 'Доступ к чат-центру за сентябрь 2026', quantity: 2, price: 2500, source: 1 },
    ]);
    expect(lines).toEqual([{ ...template[1], name: 'Доступ к чат-центру за сентябрь 2026', quantity: 2, price: 2500 }]);
  });

  it('добавленная строка несёт свои единицу и ГКЭД, ставки — от первой строки', () => {
    const [line] = mergeDraftLines(template, [
      { name: '  Интеграция с Битрикс24  ', quantity: 1, price: 15000, unit: 'Услуга', gked: '62.01.0' },
    ]);
    expect(line).toEqual({ ...template[0], name: 'Интеграция с Битрикс24', quantity: 1, price: 15000, unit: 'Услуга', gked: '62.01.0' });
  });

  it('позволяет убрать строку образца и поменять порядок', () => {
    const lines = mergeDraftLines(template, [
      { name: 'Чат-центр', quantity: 1, price: 5000, source: 1 },
      { name: 'Новая', quantity: 1, price: 100, unit: 'Штука', gked: '62.02.0' },
    ]);
    expect(lines.map((l) => [l.name, l.unit, l.gked])).toEqual([['Чат-центр', 'Месяц', '63.11.0'], ['Новая', 'Штука', '62.02.0']]);
  });

  it('старый клиент без source сопоставляется по порядку и требует все строки', () => {
    const lines = mergeDraftLines(template, [
      { name: 'А', quantity: 1, price: 1 }, { name: 'Б', quantity: 1, price: 2 },
    ]);
    expect(lines.map((l) => l.unit)).toEqual(['Штука', 'Месяц']);
    expect(() => mergeDraftLines(template, [{ name: 'А', quantity: 1, price: 1 }])).toThrow(DraftLinesError);
  });

  it.each([
    [{ name: 'X', quantity: 1, price: 1, source: 5 }, /нет в образце/],
    [{ name: 'X', quantity: 1, price: 1, unit: '', gked: '62.02.0' }, /единицу/],
    [{ name: 'X', quantity: 1, price: 1, unit: 'Штука', gked: '62' }, /ГКЭД/],
    [{ name: ' ', quantity: 1, price: 1, source: 0 }, /название/],
    [{ name: 'X', quantity: 0, price: 1, source: 0 }, /количество и цену/],
    [{ name: 'X', quantity: 1, price: 0.000001, source: 0 }, /количество и цену/],
  ])('отклоняет неверную строку %#', (input, message) => {
    expect(() => mergeDraftLines(template, [input])).toThrow(message);
  });

  it('не принимает пустую ЭСФ', () => {
    expect(() => mergeDraftLines(template, [])).toThrow(/хотя бы одну/);
  });
});

describe('Запасной путь «Создать копию»', () => {
  it('годится, только когда строки повторяют образец один в один', () => {
    expect(linesFollowTemplate([{ name: 'А', quantity: 1, price: 1 }, { name: 'Б', quantity: 1, price: 1 }])).toBe(true);
    expect(linesFollowTemplate([{ name: 'А', quantity: 1, price: 1, source: 0 }, { name: 'Б', quantity: 1, price: 1, source: 1 }], 2)).toBe(true);
    expect(linesFollowTemplate([{ name: 'Б', quantity: 1, price: 1, source: 1 }])).toBe(false);
    expect(linesFollowTemplate([{ name: 'А', quantity: 1, price: 1, source: 0 }, { name: 'Н', quantity: 1, price: 1, unit: 'Штука', gked: '62.02.0' }])).toBe(false);
    expect(linesFollowTemplate([{ name: 'А', quantity: 1, price: 1, source: 0 }], 2)).toBe(false);
  });
});
