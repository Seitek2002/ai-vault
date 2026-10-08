import { afterEach, describe, expect, it, vi } from 'vitest';
import { SettlementsScheduler } from '../settlements.scheduler';
describe('billing day in short months', () => {
  afterEach(() => vi.useRealTimers());
  it.each([['2027-02-27T06:00:00Z', 27], ['2027-02-28T06:00:00Z', 31], ['2026-04-30T06:00:00Z', 31], ['2026-10-08T06:00:00Z', 8]])('runs billing day 29–31 on the last day (%s)', async (now, cutoff) => {
    vi.useFakeTimers(); vi.setSystemTime(new Date(now));
    const findMany = vi.fn().mockResolvedValue([]);
    await new SettlementsScheduler({ contract: { findMany } } as never, {} as never).generateDueSettlements();
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ billingDay: { lte: cutoff } }) }));
  });
});
