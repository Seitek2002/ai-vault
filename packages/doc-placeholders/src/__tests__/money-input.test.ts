import { describe, expect, it } from 'vitest';
import { parseMoneyInput } from '../money-input';

describe('contract money input', () => {
  it.each([
    ['49291.66', 49291.66], ['49291,66', 49291.66],
    ['49 291,66', 49291.66], ['49\u00a0291,66', 49291.66], ['49\u202f291,66', 49291.66],
    ['50000', 50000], ['0', 0], ['0,00', 0], [' 100,50 ', 100.5], ['100,', 100],
    ['999999999999,99', 999999999999.99],
  ])('parses %s as %s', (input, expected) => {
    expect(parseMoneyInput(String(input))).toBe(expected);
  });

  it.each(['', '  ', '-1', 'NaN', 'Infinity', '1e3', '1,234', '1000000000000', '1.2,3', 'abc'])('rejects %s', (input) => {
    expect(parseMoneyInput(input)).toBeNull();
  });
});
