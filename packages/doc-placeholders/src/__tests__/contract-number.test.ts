import { describe, expect, it } from 'vitest';
import { contractNumberPeriod, formatContractNumber, shortContractNumber } from '../contract-number';

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

describe('Короткий номер договора для внешних документов', () => {
  it('сжимает шестизначный счётчик до четырёх цифр, сохраняя суффикс', () => {
    expect(shortContractNumber('ДГ-000003/0326')).toBe('ДГ-0003/0326');
    expect(shortContractNumber('ДГ-000012/1026')).toBe('ДГ-0012/1026');
  });

  it('не трогает чужие форматы и короткие номера', () => {
    expect(shortContractNumber('022/0926')).toBe('022/0926');
    expect(shortContractNumber('Klot-027/0226')).toBe('Klot-027/0226');
    expect(shortContractNumber('09/1026')).toBe('09/1026');
    expect(shortContractNumber('037/1 - 04-17-2926/170/0526')).toBe('037/1 - 04-17-2926/170/0526');
  });

  it('не режет значащие цифры', () => {
    expect(shortContractNumber('ДГ-123456/1026')).toBe('ДГ-123456/1026');
    expect(shortContractNumber('ДГ-012345/1026')).toBe('ДГ-12345/1026');
  });
});
