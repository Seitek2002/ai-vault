import { describe, expect, it } from 'vitest';
import { contractBillsInMonth, effectiveContractEndDate, type ContractSchedule } from './contract-conditions';

const contract: ContractSchedule = { active: true, startDate: '2026-01-31', endDate: '2026-02-28', termValue: 1, termUnit: 'MONTHS' };
describe('contract billing and renewal', () => {
  it('excludes inactive, terminated, future and expired contracts', () => {
    for (const patch of [{ active: false }, { terminationDate: '2026-02-01' }, { startDate: '2026-04-01' }]) {
      expect(contractBillsInMonth({ ...contract, ...patch }, 2026, 2)).toBe(false);
    }
    expect(contractBillsInMonth(contract, 2026, 3)).toBe(false);
    expect(contractBillsInMonth(contract, 2026, 2)).toBe(true);
  });
  it('charges annually in the signing month, falling back to creation month', () => {
    const yearly = { ...contract, endDate: null, billingPeriod: 'YEARLY' as const };
    expect(contractBillsInMonth(yearly, 2027, 1)).toBe(true);
    expect(contractBillsInMonth(yearly, 2027, 2)).toBe(false);
    expect(contractBillsInMonth({ ...yearly, startDate: null, createdAt: '2025-06-20' }, 2026, 6)).toBe(true);
  });
  it('renews calendar months from the original date without February drift', () => {
    const renew = { ...contract, autoRenew: true };
    expect(effectiveContractEndDate(renew, new Date('2026-03-01'))).toBe('2026-03-31');
    expect(effectiveContractEndDate(renew, new Date('2026-10-08'))).toBe('2026-10-31');
    expect(contractBillsInMonth(renew, 2027, 2)).toBe(true);
    expect(contract.endDate).toBe('2026-02-28');
  });
  it('renews a manually dated contract by its original duration', () => {
    expect(effectiveContractEndDate({ ...contract, termValue: null, termUnit: null, autoRenew: true }, new Date('2026-03-02'))).toBe('2026-03-28');
  });
  it('preserves a leap year anchor over several annual renewals', () => {
    expect(effectiveContractEndDate({ active: true, startDate: '2024-02-29', endDate: '2025-02-28', termValue: 12, termUnit: 'MONTHS', autoRenew: true }, new Date('2028-02-01'))).toBe('2028-02-29');
  });
});
