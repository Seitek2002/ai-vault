import { describe, expect, it } from 'vitest';
import { calculateContractEndDate } from '../contract-term';

describe('calendar contract terms', () => {
  it.each([
    ['2026-10-06', 6, 'MONTHS', '2027-04-06'],
    ['2026-10-06', 2, 'YEARS', '2028-10-06'],
    ['2026-01-31', 1, 'MONTHS', '2026-02-28'],
    ['2024-01-31', 1, 'MONTHS', '2024-02-29'],
    ['2026-01-31', 2, 'MONTHS', '2026-03-31'],
    ['2024-02-29', 1, 'YEARS', '2025-02-28'],
    ['2024-02-29', 4, 'YEARS', '2028-02-29'],
    ['2026-12-31', 1, 'MONTHS', '2027-01-31'],
  ] as const)('%s + %s %s = %s', (start, value, unit, expected) => {
    expect(calculateContractEndDate(start, value, unit)).toBe(expected);
  });

  it.each(['', 'invalid', '2026-02-30', '2026-13-01'])('rejects invalid start %s', (start) => {
    expect(calculateContractEndDate(start, 1, 'MONTHS')).toBeNull();
  });

  it.each([0, -1, 1.5, NaN, Infinity, 1201])('rejects invalid month count %s', (value) => {
    expect(calculateContractEndDate('2026-01-01', value, 'MONTHS')).toBeNull();
  });

  it('limits years and date overflow', () => {
    expect(calculateContractEndDate('2026-01-01', 101, 'YEARS')).toBeNull();
    expect(calculateContractEndDate('9999-12-31', 1, 'MONTHS')).toBeNull();
  });
});
