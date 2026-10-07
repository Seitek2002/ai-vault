import { QueryClient, QueryObserver } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';
import { esfApi, esfCoversSettlement, type EsfInvoice } from '../api/esf';
import { esfInvoicesQuery } from './esf';

vi.mock('../api/client', () => ({ api: { get: vi.fn() } }));

describe('shared ESF cache', () => {
  it('fetches once for simultaneous views and keeps settlement selection out of the cache', async () => {
    const base: EsfInvoice = {
      id: 'one', uuid: 'uuid-one', number: '001', status: 'ACCEPTED',
      deliveryDate: null, issuedOn: null, buyerInn: null, buyerName: 'Partner',
      amount: 100, crmRef: null, note: null, counterpartyId: 'partner-one',
      counterpartyName: 'Partner', settlementId: null, fileAssetId: null,
      matchNote: null, hiddenAt: null, importedAt: '2026-10-01T00:00:00Z',
    };
    const invoices: EsfInvoice[] = [
      { ...base, settlementIds: ['jan', 'feb'] },
      { ...base, id: 'two', uuid: 'uuid-two', settlementId: 'mar' },
    ];
    const list = vi.spyOn(esfApi, 'list').mockResolvedValue(invoices);
    const client = new QueryClient({ defaultOptions: { queries: { staleTime: 30_000 } } });
    try {
      await Promise.all([client.fetchQuery(esfInvoicesQuery), client.fetchQuery(esfInvoicesQuery)]);
      const jan = new QueryObserver(client, { ...esfInvoicesQuery,
        select: (all) => all.filter((i) => esfCoversSettlement(i, 'jan')) });
      const mar = new QueryObserver(client, { ...esfInvoicesQuery,
        select: (all) => all.filter((i) => esfCoversSettlement(i, 'mar')) });
      expect(jan.getCurrentResult().data?.map((i) => i.id)).toEqual(['one']);
      expect(mar.getCurrentResult().data?.map((i) => i.id)).toEqual(['two']);
      expect(client.getQueryData(esfInvoicesQuery.queryKey)).toEqual(invoices);
      await client.fetchQuery(esfInvoicesQuery);
      expect(list).toHaveBeenCalledOnce();
      jan.destroy();
      mar.destroy();
    } finally {
      client.clear();
      list.mockRestore();
    }
  });
});
