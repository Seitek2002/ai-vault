import { QueryClient, QueryObserver } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';
import type { Contract } from '../api/contracts';
import { publishSavedContract } from './contracts';

const old = { id: 'contract', number: '037/1 - 04-17-2926/170/0526', title: 'Old service' } as Contract;
const saved = { ...old, number: '037/1-ОУ-АТ-2026/170/0526', title: 'Updated service' };

describe('contract save cache readback', () => {
  it('makes the saved number and service name available immediately on reopening without changing other contracts', async () => {
    const qc = new QueryClient();
    const other = { id: 'other', number: '22/0826' } as Contract;
    qc.setQueryData(['contracts'], [old, other]);
    qc.setQueryData(['settlements', 2026, 10], { settlements: [] });
    qc.setQueryData(['contract-history', old.id], {});
    qc.setQueryData(['esf', 'all'], []);
    qc.setQueryData(['esf-draft-preview', 'set'], { contractNumber: old.number });
    await publishSavedContract(qc, saved);
    expect(qc.getQueryData(['contracts'])).toEqual([saved, other]);
    for (const key of [['contracts'], ['settlements', 2026, 10], ['contract-history', old.id], ['esf', 'all'], ['esf-draft-preview', 'set']]) {
      expect(qc.getQueryState(key)?.isInvalidated).toBe(true);
    }
    qc.clear();
  });

  it('cancels an older list request so it cannot replace the saved number', async () => {
    const qc = new QueryClient();
    qc.setQueryData(['contracts'], [old]);
    let complete!: (value: Contract[]) => void;
    const pending = qc.fetchQuery({ queryKey: ['contracts'], queryFn: () => new Promise<Contract[]>(resolve => { complete = resolve; }) }).catch(() => undefined);
    await publishSavedContract(qc, saved);
    complete([old]); await pending;
    expect(qc.getQueryData(['contracts'])).toEqual([saved]);
    qc.clear();
  });

  it('does not reload an open ESF editor and erase its unsaved service rows', async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity } } });
    const queryFn = vi.fn();
    qc.setQueryData(['esf-draft-preview', 'set'], { contractNumber: old.number });
    const observer = new QueryObserver(qc, { queryKey: ['esf-draft-preview', 'set'], queryFn });
    const unsubscribe = observer.subscribe(() => {});
    await publishSavedContract(qc, saved);
    expect(queryFn).not.toHaveBeenCalled();
    expect(qc.getQueryState(['esf-draft-preview', 'set'])?.isInvalidated).toBe(true);
    unsubscribe(); qc.clear();
  });

  it('adds a newly saved contract to the existing list', async () => {
    const qc = new QueryClient(); qc.setQueryData(['contracts'], [old]);
    const created = { ...saved, id: 'new' };
    await publishSavedContract(qc, created);
    expect(qc.getQueryData(['contracts'])).toEqual([created, old]);
    qc.clear();
  });
});
