import type { QueryClient } from '@tanstack/react-query';
import type { Contract } from '../api/contracts';

/** Publish the server's saved value before the modal closes or can reopen. */
export async function publishSavedContract(qc: QueryClient, saved: Contract) {
  await qc.cancelQueries({ queryKey: ['contracts'] });
  qc.setQueryData<Contract[]>(['contracts'], current => current
    ? current.some(contract => contract.id === saved.id)
      ? current.map(contract => contract.id === saved.id ? saved : contract)
      : [saved, ...current]
    : undefined);
  for (const key of ['contracts', 'settlements', 'settlement', 'contract-history', 'esf', 'esf-draft-preview']) {
    // An open ESF editor has unsaved service rows. Mark it stale for the next
    // opening without refetching and resetting those edits in the background.
    void qc.invalidateQueries({ queryKey: [key], ...(key === 'esf-draft-preview' ? { refetchType: 'none' as const } : {}) });
  }
}
