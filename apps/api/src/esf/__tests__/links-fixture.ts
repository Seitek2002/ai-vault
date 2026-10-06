import { EsfStatus } from '@prisma/client';
import { vi } from 'vitest';
import { EsfLinksService } from '../esf-links.service';

export function linksFixture() {
  const invoices = [{ id: 'inv', organizationId: 'org', status: EsfStatus.ACCEPTED as EsfStatus, settlementId: 's1' as string | null, fileAssetId: 'pdf', number: '123', issuedOn: new Date('2026-08-31'), counterpartyId: 'company', hiddenAt: null }];
  let links = [{ invoiceId: 'inv', settlementId: 's1' }];
  const settlements = ['s1', 's2', 's3'].map((id) => ({ id, organizationId: 'org', counterpartyId: 'company', currency: 'KGS', closedAt: null as Date | null }));
  const steps = settlements.map((s) => ({ id: `step-${s.id}`, settlementId: s.id, doneAt: s.id === 's1' ? new Date() : null as Date | null, doneById: 'user' as string | null, evidenceUrl: null as string | null, fileAssetId: s.id === 's1' ? 'pdf' : null as string | null, note: null as string | null }));
  const prisma = {
    $executeRaw: vi.fn().mockResolvedValue(0),
    esfInvoice: {
      findFirst: vi.fn(async ({ where }: any) => {
        const found = invoices.find((i) => i.organizationId === where.organizationId && (typeof where.id === 'string' ? i.id === where.id : i.id !== where.id?.not)
          && (!where.OR || where.OR.some((clause: any) => clause.settlementId?.in?.includes(i.settlementId) || links.some((l) => l.invoiceId === i.id && clause.settlementLinks?.some?.settlementId?.in?.includes(l.settlementId)))));
        return found ? { ...found, settlementLinks: links.filter((l) => l.invoiceId === found.id) } : null;
      }),
      update: vi.fn(async ({ where, data }: any) => Object.assign(invoices.find((i) => i.id === where.id)!, data)),
    },
    esfSettlementLink: {
      deleteMany: vi.fn(async ({ where }: any) => { links = links.filter((l) => l.invoiceId !== where.invoiceId || where.settlementId.notIn.includes(l.settlementId)); }),
      createMany: vi.fn(async ({ data }: any) => { links.push(...data); }),
    },
    settlement: {
      findMany: vi.fn(async ({ where }: any) => settlements.filter((s) => s.organizationId === where.organizationId && where.id.in.includes(s.id))),
      update: vi.fn(async ({ where, data }: any) => Object.assign(settlements.find((s) => s.id === where.id)!, data)),
    },
    settlementStep: {
      findUnique: vi.fn(async ({ where }: any) => steps.find((s) => s.settlementId === where.settlementId_type.settlementId)),
      update: vi.fn(async ({ where, data }: any) => Object.assign(steps.find((s) => s.id === where.id)!, data)),
      count: vi.fn(async ({ where }: any) => steps.filter((s) => s.settlementId === where.settlementId && !s.doneAt).length),
    },
    fileAsset: { update: vi.fn().mockResolvedValue({}) },
    $transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn(prisma)),
  };
  return { service: new EsfLinksService(prisma as never), prisma, invoices, settlements, steps, links: () => links };
}
