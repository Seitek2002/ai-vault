import { describe, expect, it } from 'vitest';
import { esfCoversSettlement, esfSettlementIds, type EsfInvoice } from '../api/esf';

describe('ЭСФ: обратная совместимость и вторичные месяцы', () => {
  it('видит первичный месяц старого API и все месяцы нового без дублей', () => {
    const inv = { settlementId: 'a', settlementIds: ['a', 'b'], settlements: [{ id: 'b' }, { id: 'c' }] } as EsfInvoice;
    expect(esfSettlementIds(inv)).toEqual(['a', 'b', 'c']);
    expect(esfCoversSettlement(inv, 'b')).toBe(true);
    expect(esfCoversSettlement(inv, 'foreign')).toBe(false);
    expect(esfSettlementIds({ settlementId: 'a' } as EsfInvoice)).toEqual(['a']);
    expect(esfSettlementIds({ settlementId: null } as EsfInvoice)).toEqual([]);
  });
});
