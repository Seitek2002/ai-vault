import { EsfStatus, Prisma } from '@prisma/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { seal } from '../../common/secret-box';
import { EsfService } from '../esf.service';
import { MANUAL_ESF_DETACH_NOTE } from '../esf-links.service';

afterEach(() => vi.unstubAllEnvs());
function fixture(matchNote: string | null, status = 'Новый') {
  vi.stubEnv('ESF_SECRET_KEY', 'ab'.repeat(32));
  const invoice = { id: 'old', uuid: 'old-uuid', status: EsfStatus.NEW, settlementId: null,
    settlementLinks: [], hiddenAt: null, fileAssetId: 'pdf', matchNote, counterpartyId: 'partner',
    buyerInn: '123', buyerName: 'Company', crmRef: 'ErkinAI.Docs-set', deliveryDate: new Date('2026-10-08'), amount: new Prisma.Decimal(35000) };
  const prisma = {
    companySettings: { findUnique: vi.fn().mockResolvedValue({ esfLogin: 'test', esfPasswordEnc: seal('test-password') }), update: vi.fn() },
    esfInvoice: { findMany: vi.fn().mockResolvedValue([invoice]), findFirst: vi.fn().mockResolvedValue(invoice), update: vi.fn() },
    settlement: { findMany: vi.fn().mockResolvedValue([{ id: 'set', year: 2026, month: 10, amount: new Prisma.Decimal(35000),
      sequence: 1, label: null, contract: { title: 'Services' }, documents: [], esfInvoices: [], esfLinks: [] }]) },
  };
  const links = { attach: vi.fn(), refreshStatus: vi.fn() };
  const portal = { fetchRealizationList: vi.fn().mockResolvedValue([{ uuid: invoice.uuid, status, number: '1', issuedOn: '08.10.2026' }]) };
  const pdf = { download: vi.fn() };
  return { prisma, links, pdf, service: new EsfService(prisma as never, {} as never, portal as never, {} as never, pdf as never, links as never) };
}

describe('synchronization after manual ESF detach', () => {
  it.each(['Новый', 'Принят'])('does not reattach a manually detached invoice even when status is %s', async (status) => {
    const f = fixture(MANUAL_ESF_DETACH_NOTE, status);
    const report = await f.service.sync('org', 'user');
    expect(report.matched).toBe(0);
    expect(report.errors).toEqual([]);
    expect(f.links.attach).not.toHaveBeenCalled();
    expect(f.prisma.settlement.findMany).not.toHaveBeenCalled();
    expect(f.pdf.download).not.toHaveBeenCalled();
    expect(f.links.refreshStatus).toHaveBeenCalledTimes(status === 'Принят' ? 1 : 0);
  });
  it('still automatically matches an ordinary unlinked invoice', async () => {
    const f = fixture(null);
    const report = await f.service.sync('org', 'user');
    expect(report.matched).toBe(1);
    expect(f.links.attach).toHaveBeenCalledWith('org', 'user', 'old', ['set']);
  });
});
