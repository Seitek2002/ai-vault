import { Prisma, type Contract } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { SettlementsService } from '../settlements.service';

function fixture() {
  const row = { id: 'set', organizationId: 'org', contractId: 'contract', counterpartyId: 'partner',
    year: 2026, month: 8, sequence: 1, label: 'Extra', amount: new Prisma.Decimal(95), vatAmount: new Prisma.Decimal(0), currency: 'KGS',
    deletedAt: null as Date | null, closedAt: null, contract: { title: 'Services' }, counterparty: { name: 'Bakai' }, steps: [],
    payments: [{ id: 'payment', amount: new Prisma.Decimal(95), paidAt: new Date(), reference: 'Paid', fileAssetId: 'receipt' }] };
  const documents = [{ id: 'act', settlementId: row.id }];
  const files = [{ id: 'pdf', settlementId: row.id }];
  const links = [{ invoiceId: 'invoice', settlementId: row.id }, { invoiceId: 'invoice', settlementId: 'other-month' }];
  const prisma = {
    settlement: {
      updateMany: vi.fn(async ({ where, data }: { where: { id: string; organizationId: string }; data: { deletedAt: Date | null } }) => {
        if (where.id !== row.id || where.organizationId !== row.organizationId) return { count: 0 };
        row.deletedAt = data.deletedAt; return { count: 1 };
      }),
      findFirst: vi.fn(async ({ where }: { where: { id?: string; organizationId?: string } }) =>
        (!where.id || where.id === row.id) && (!where.organizationId || where.organizationId === row.organizationId) ? row : null),
      findMany: vi.fn(async ({ where }: { where: { organizationId: string; deletedAt: unknown } }) =>
        where.organizationId === row.organizationId && (where.deletedAt === null ? !row.deletedAt : !!row.deletedAt) ? [row] : []),
      findUnique: vi.fn(async () => row),
      create: vi.fn(), delete: vi.fn(),
    },
    $executeRaw: vi.fn(),
    $transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn(prisma)),
  };
  const service = new SettlementsService(prisma as never, {} as never);
  return { row, prisma, service, documents, files, links };
}

describe('reversible settlement deletion', () => {
  it('removes only the target from active totals while preserving payments, files, documents and multi-period ESF links', async () => {
    const f = fixture();
    const evidence = JSON.stringify({ payments: f.row.payments, documents: f.documents, files: f.files, links: f.links });
    expect((await f.service.findAll('org', { year: 2026, month: 8 })).totals.count).toBe(1);
    await f.service.remove('set', 'org');
    expect(f.row.deletedAt).toBeInstanceOf(Date);
    expect((await f.service.findAll('org', { year: 2026, month: 8 })).totals.count).toBe(0);
    const trash = await f.service.findAll('org', { year: 2026, month: 8 }, true);
    expect(trash.settlements[0]).toMatchObject({ id: 'set', paidAmount: 95, sequence: 1 });
    expect(JSON.stringify({ payments: f.row.payments, documents: f.documents, files: f.files, links: f.links })).toBe(evidence);
    expect(f.prisma.settlement.delete).not.toHaveBeenCalled();
    await f.service.restore('set', 'org');
    expect(f.row.deletedAt).toBeNull();
    expect((await f.service.findAll('org', { year: 2026, month: 8 })).settlements[0]).toMatchObject({ id: 'set', paidAmount: 95, sequence: 1 });
  });
  it.each(['remove', 'restore'] as const)('rejects %s from another organization', async (action) => {
    const f = fixture();
    await expect(f.service[action]('set', 'foreign')).rejects.toThrow('Расчёт не найден');
    expect(f.row.deletedAt).toBeNull();
  });
  it('prevents changes to deleted steps and payments until restored', async () => {
    const f = fixture(); await f.service.remove('set', 'org');
    await expect(f.service.update('set', 'org', 'user', { amount: 1 })).rejects.toThrow('Сначала восстановите');
    await expect(f.service.removePayment('set', 'payment', 'org')).rejects.toThrow('Сначала восстановите');
    await expect(f.service.completeStep('set', 'step', 'org', 'user', {})).rejects.toThrow('Сначала восстановите');
  });
  it('does not regenerate a deleted primary set when forming the month again', async () => {
    const f = fixture(); await f.service.remove('set', 'org');
    const contract = { id: 'contract', organizationId: 'org', active: true, billingPeriod: 'MONTHLY', startDate: null, endDate: null } as Contract;
    expect(await f.service.generateOne(contract, 2026, 8, 'user')).toBeNull();
    expect(f.prisma.settlement.create).not.toHaveBeenCalled();
  });
});
