import { describe, expect, it, vi } from 'vitest';
import { Prisma } from '@prisma/client';
import { ContractHistoryService } from '../contract-history.service';
import type { PrismaService } from '../../prisma/prisma.service';

const decimal = (amount: number) => new Prisma.Decimal(amount);
const file = (id = 'pdf', organizationId = 'org') => ({ id, organizationId, originalName: `${id}.pdf`, mimeType: 'application/pdf', size: 20 });
const document = (id: string, organizationId = 'org') => ({ id, organizationId, title: 'Акт', number: 'А-1', type: 'AVR', status: 'SIGNED', isArchived: true, createdAt: new Date(), fileAssets: [file()], scans: [] });
const period = (id: string, month: number, organizationId = 'org') => ({ id, organizationId, contractId: 'contract', year: 2026, month, sequence: 1, contract: { number: 'ДГ-1/0826' } });
const invoice = () => ({ id: 'invoice', organizationId: 'org', uuid: 'portal-id', number: 'ЭСФ-1', status: 'ACCEPTED', amount: decimal(200), issuedOn: null, deliveryDate: new Date(), note: 'За два месяца', fileAsset: file(), settlement: period('august', 8), settlementLinks: [{ settlement: period('august', 8) }, { settlement: period('september', 9) }] });
const settlement = (id: string, month: number, amount = 100) => ({ id, year: 2026, month, sequence: 1, label: null, amount: decimal(amount), currency: 'KGS', closedAt: null, steps: [], payments: [], documents: [], fileAssets: [], esfInvoices: [], esfLinks: [] });
function setup(rows: unknown[] = []) {
  const prisma = { contract: { findFirst: vi.fn().mockResolvedValue({ id: 'contract' }) }, settlement: { findMany: vi.fn().mockResolvedValue(rows) } };
  return { prisma, service: new ContractHistoryService(prisma as unknown as PrismaService) };
}

describe('contract financial history', () => {
  it('checks organization ownership before accessing any settlements', async () => {
    const { prisma, service } = setup();
    prisma.contract.findFirst.mockResolvedValue(null as never);
    await expect(service.find('foreign-contract', 'org')).rejects.toThrow('Договор не найден');
    expect(prisma.contract.findFirst).toHaveBeenCalledWith({ where: { id: 'foreign-contract', organizationId: 'org' }, select: { id: true } });
    expect(prisma.settlement.findMany).not.toHaveBeenCalled();
  });
  it('loads all periods and sets in one scoped metadata query without document bodies or storage keys', async () => {
    const { prisma, service } = setup();
    expect(await service.find('contract', 'org')).toEqual({ settlements: [], totals: [] });
    const query = prisma.settlement.findMany.mock.calls[0]![0];
    expect(query.where).toEqual({ contractId: 'contract', organizationId: 'org' });
    expect(query.orderBy).toEqual([{ year: 'desc' }, { month: 'desc' }, { sequence: 'asc' }]);
    expect(query).not.toHaveProperty('take');
    for (const field of ['bodyJson', 'meta', 's3Key', 's3Url']) expect(JSON.stringify(query)).not.toContain(`"${field}"`);
  });
  it('deduplicates legacy and many-period ESF links, retaining coverage of every month', async () => {
    const esf = invoice();
    const { service } = setup([{ ...settlement('september', 9), esfLinks: [{ invoice: esf }] }, { ...settlement('august', 8), esfInvoices: [esf], esfLinks: [{ invoice: esf }] }]);
    const result = await service.find('contract', 'org');
    expect(result.settlements).toHaveLength(2);
    for (const set of result.settlements) {
      expect(set.esfInvoices).toHaveLength(1);
      expect(set.esfInvoices[0]!.periods.map((p) => p.month)).toEqual([8, 9]);
      expect(set.esfInvoices[0]!.amount).toBe(200);
    }
    expect(result.totals[0]!.billed).toBe(200);
  });
  it('keeps multiple sets in the same month and does not cancel unpaid debt with another set overpayment', async () => {
    const { service } = setup([
      { ...settlement('first', 8, 100.1), payments: [{ id: 'p', organizationId: 'org', amount: decimal(150.2), paidAt: new Date(), reference: 'Оплата', fileAsset: null }] },
      { ...settlement('second', 8, 200.2), sequence: 2, payments: [{ id: 'p2', organizationId: 'org', amount: decimal(50.1), paidAt: new Date(), reference: null, fileAsset: file() }] },
      { ...settlement('usd', 7, 10), currency: 'USD' },
    ]);
    const result = await service.find('contract', 'org');
    expect(result.settlements.map((s) => s.sequence)).toEqual([1, 2, 1]);
    expect(result.totals).toEqual([{ currency: 'KGS', billed: 300.3, paid: 200.3, due: 150.1, overpaid: 50.1 }, { currency: 'USD', billed: 10, paid: 0, due: 10, overpaid: 0 }]);
  });
  it('retains archived documents, signed scans and step evidence, filtering foreign nested records', async () => {
    const esf = invoice();
    const doc = document('act');
    const { service } = setup([{ ...settlement('set', 8), documents: [{ ...doc, scans: [document('signed')] }, document('foreign', 'other')],
      steps: [{ type: 'ISSUE_ACT', order: 1, dueDate: null, doneAt: new Date('2026-08-01'), note: 'Загружен', evidenceUrl: 'https://example.org', doneBy: { name: 'Manager' }, fileAsset: file('foreign-file', 'other'), document: doc }],
      payments: [{ id: 'foreign-payment', organizationId: 'other', amount: decimal(900), paidAt: new Date(), fileAsset: null }],
      fileAssets: [file(), file('foreign-file', 'other')],
      esfLinks: [{ invoice: { ...esf, organizationId: 'other' } }],
    }]);
    const result = await service.find('contract', 'org');
    const set = result.settlements[0]!;
    expect(set.documents.map((d) => d.id)).toEqual(['act', 'signed']);
    expect(set.documents[0]!.isArchived).toBe(true);
    expect(set.steps[0]).toMatchObject({ note: 'Загружен', doneByName: 'Manager', evidenceUrl: 'https://example.org', file: null });
    expect(set.payments).toEqual([]);
    expect(set.paidAmount).toBe(0);
    expect(set.esfInvoices).toEqual([]);
    expect(set.files.map((f) => f.id)).toEqual(['pdf']);
    expect(JSON.stringify(result)).not.toContain('organizationId');
  });
});
