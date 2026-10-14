import { EsfStatus, Prisma, SettlementStepType } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { SettlementsService } from '../settlements.service';

function fixture() {
  const invoice = { organizationId: 'org', status: EsfStatus.NEW as EsfStatus, hiddenAt: null as Date | null };
  const step = { id: 'esf-step', type: SettlementStepType.ISSUE_ESF, order: 4, dueDate: new Date('2026-11-05'), doneAt: null as Date | null };
  const row = { id: 'set', organizationId: 'org', contractId: 'contract', counterpartyId: 'company', year: 2026, month: 10,
    sequence: 1, label: null, amount: new Prisma.Decimal(95), vatAmount: new Prisma.Decimal(0), currency: 'KGS',
    closedAt: null, contract: { title: 'Services' }, counterparty: { name: 'Company' }, payments: [],
    steps: [step, { ...step, id: 'act', type: SettlementStepType.ISSUE_ACT }],
    esfLinks: [{ invoice }], esfInvoices: [] as typeof invoice[],
  };
  const prisma = { settlement: { findMany: vi.fn().mockResolvedValue([row]) } };
  const service = new SettlementsService(prisma as never, {} as never);
  const read = async () => (await service.findAll('org', { year: 2026, month: 10 })).settlements[0]!;
  return { invoice, row, step, read };
}

describe('portal status on the monthly ESF step', () => {
  it.each(Object.values(EsfStatus))('shows linked %s without changing checklist completion', async status => {
    const f = fixture(); f.invoice.status = status;
    const result = await f.read();
    expect(result.steps[0]).toMatchObject({ esfStatus: status, doneAt: null });
    expect(result.steps[1]!.esfStatus).toBeNull();
    expect(f.step.doneAt).toBeNull();
    expect(result.amount).toBe(95);
  });

  it('reads the current portal status after each synchronization, including a sent step that is already done', async () => {
    const f = fixture();
    expect((await f.read()).steps[0]!.esfStatus).toBe('NEW');
    f.invoice.status = EsfStatus.SENT; f.step.doneAt = new Date('2026-10-14');
    expect((await f.read()).steps[0]).toMatchObject({ esfStatus: 'SENT', doneAt: '2026-10-14T00:00:00.000Z' });
    f.invoice.status = EsfStatus.ACCEPTED;
    expect((await f.read()).steps[0]!.esfStatus).toBe('ACCEPTED');
  });

  it('prefers the multi-period link over a stale legacy invoice and supports legacy-only links', async () => {
    const f = fixture();
    f.row.esfInvoices = [{ ...f.invoice, status: EsfStatus.ACCEPTED }];
    expect((await f.read()).steps[0]!.esfStatus).toBe('NEW');
    f.row.esfLinks = [];
    expect((await f.read()).steps[0]!.esfStatus).toBe('ACCEPTED');
    f.row.esfInvoices = [];
    expect((await f.read()).steps[0]!.esfStatus).toBeNull();
  });

  it('does not expose another organization invoice or a hidden invoice', async () => {
    const f = fixture(); f.invoice.organizationId = 'other-org';
    expect((await f.read()).steps[0]!.esfStatus).toBeNull();
    f.invoice.organizationId = 'org'; f.invoice.hiddenAt = new Date();
    expect((await f.read()).steps[0]!.esfStatus).toBeNull();
  });
});
