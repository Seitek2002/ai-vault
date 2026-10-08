import { describe, expect, it } from 'vitest';
import { contractNumberPeriod, formatContractNumber } from '../contract-number';

describe('contract number period', () => {
  it.each([
    ['2026-08-05', '0826'], ['2005-08-05', '0805'], ['2025-12-31', '1225'], ['2027-01-01', '0127'],
  ])('formats the calendar date %s', (date, expected) => {
    expect(formatContractNumber('ДГ-000006', date)).toBe(`ДГ-000006/${expected}`);
  });
  it('uses Bishkek time for a creation timestamp near month and year boundaries', () => {
    expect(contractNumberPeriod(null, new Date('2026-12-31T19:00:00Z'))).toBe('0127');
    expect(contractNumberPeriod(null, new Date('2026-07-31T19:00:00Z'))).toBe('0826');
  });
  it('preserves a manual suffix without duplication or dependence on later edits', () => {
    expect(formatContractNumber(' 22/0826 ', '2026-10-01')).toBe('22/0826');
    expect(formatContractNumber(formatContractNumber('22/', '2026-08-01'), '2027-01-01')).toBe('22/0826');
  });
});
