import { describe, expect, it } from 'vitest';
import { syncAvrPeriodInBody, syncPeriodInBody } from '../docBody';

const body = (value: string) => ({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: value }] }] });

describe('generated document periods in the editor', () => {
  it.each([' - ', ' – '])('updates both act dates for separator %s', separator => {
    const result = syncAvrPeriodInBody(body(`Период оказания услуг: 1.10.26 г.${separator}31.10.26 г.`), '2026-11-01', '2026-11-30');
    expect(JSON.stringify(result)).toContain('Период оказания услуг: 1.11.26 г. - 30.11.26 г.');
  });
  it('updates the standard invoice period', () => {
    const result = syncPeriodInBody(body('Услуги за период 1.10.26 г. - 31.10.26 г.'), '2026-11-01', '2026-11-30');
    expect(JSON.stringify(result)).toContain('Услуги за период 1.11.26 г. - 30.11.26 г.');
  });
});
