import { describe, expect, it } from 'vitest';
import { sanitizePm } from '../settlement-docs.service';

const text = (t: string) => ({ type: 'text', text: t });

function stringify(node: unknown): string {
  return JSON.stringify(node);
}

describe('sanitizePm', () => {
  it('выбрасывает пустые текстовые узлы', () => {
    const doc = {
      type: 'doc',
      content: [{ type: 'paragraph', content: [text('Заполнено'), text('')] }],
    };
    expect(stringify(sanitizePm(doc))).not.toContain('"text":""');
    expect(stringify(sanitizePm(doc))).toContain('Заполнено');
  });

  it('пустой абзац остаётся — это валидная пустая строка', () => {
    const doc = {
      type: 'doc',
      content: [{ type: 'paragraph', content: [text('')] }, { type: 'paragraph' }],
    };
    const out = sanitizePm(doc) as { content: unknown[] };
    expect(out.content).toHaveLength(2);
    expect(stringify(out)).not.toContain('"text":""');
  });

  it('чистит вложенные узлы — ячейки таблиц тоже', () => {
    const doc = {
      type: 'doc',
      content: [
        {
          type: 'table',
          content: [
            {
              type: 'tableRow',
              content: [
                { type: 'tableCell', content: [{ type: 'paragraph', content: [text('')] }] },
                { type: 'tableCell', content: [{ type: 'paragraph', content: [text('Сумма')] }] },
              ],
            },
          ],
        },
      ],
    };
    const out = stringify(sanitizePm(doc));
    expect(out).not.toContain('"text":""');
    expect(out).toContain('Сумма');
  });

  it('не трогает документ без пустых узлов', () => {
    const doc = { type: 'doc', content: [{ type: 'paragraph', content: [text('Ок')] }] };
    expect(sanitizePm(doc)).toEqual(doc);
  });

  it('сохраняет marks и attrs', () => {
    const doc = {
      type: 'doc',
      content: [
        {
          type: 'heading',
          attrs: { level: 1, textAlign: 'center' },
          content: [{ type: 'text', text: 'АКТ', marks: [{ type: 'bold' }] }],
        },
      ],
    };
    expect(sanitizePm(doc)).toEqual(doc);
  });
});
