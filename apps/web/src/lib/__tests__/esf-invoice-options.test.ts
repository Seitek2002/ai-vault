import { describe, expect, it } from 'vitest';
import { esfCoversSettlement, esfUnlinkedPartnerInvoices, type EsfInvoice } from '../api/esf';

const invoice = (overrides: Partial<EsfInvoice> = {}): EsfInvoice => ({
  id: 'free', uuid: 'uuid-free', number: '001', status: 'ACCEPTED', amount: 100,
  deliveryDate: null, issuedOn: null, buyerInn: null, buyerName: 'Partner',
  counterpartyId: 'partner', counterpartyName: 'Partner', settlementId: null,
  fileAssetId: null, note: null, crmRef: null, matchNote: null, hiddenAt: null,
  importedAt: '2026-10-01T00:00:00Z', ...overrides,
});

describe('Free ESFs in the settlement picker', () => {
  it.each([
    { settlementId: 'current' },
    { settlementIds: ['another-month'] },
    { settlements: [{ id: 'current' }] as NonNullable<EsfInvoice['settlements']> },
  ])('excludes existing links represented as %o without removing them from the shared data', (link) => {
    const linked = invoice({ id: 'linked', ...link });
    const all = [linked, invoice()];
    expect(esfUnlinkedPartnerInvoices(all, 'partner').map((i) => i.id)).toEqual(['free']);
    expect(all).toEqual([linked, invoice()]);
    if (link.settlementId === 'current' || link.settlements) expect(esfCoversSettlement(linked, 'current')).toBe(true);
  });

  it('offers only visible sent or accepted invoices of this partner', () => {
    const all = [invoice({ id: 'sent', status: 'SENT' }), invoice(),
      invoice({ id: 'other', counterpartyId: 'other' }), invoice({ id: 'hidden', hiddenAt: '2026-10-01' }),
      ...(['NEW', 'REJECTED', 'REVOKED', 'UNKNOWN'] as const).map((status) => invoice({ id: status, status }))];
    expect(esfUnlinkedPartnerInvoices(all, 'partner').map((i) => i.id)).toEqual(['sent', 'free']);
  });
});
