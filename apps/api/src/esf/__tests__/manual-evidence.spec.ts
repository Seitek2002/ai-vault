import { EsfStatus } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { EsfService } from '../esf.service';
import type { EsfListRow } from '../esf-portal.client';

function fixture(evidence: { evidenceUrl: string | null; fileAssetId: string | null }) {
  const step = { id: 'step-1', doneAt: new Date() as Date | null, doneById: 'user-1', ...evidence };
  const invoice = { id: 'invoice-1', uuid: 'uuid-1', status: EsfStatus.ACCEPTED as EsfStatus, settlementId: 'settlement-1', hiddenAt: null, fileAssetId: 'portal-pdf' };
  const prisma = {
    esfInvoice: { findFirst: vi.fn().mockResolvedValue(invoice), update: vi.fn().mockResolvedValue({}) },
    settlementStep: { findUnique: vi.fn().mockResolvedValue(step), update: vi.fn().mockResolvedValue({}), count: vi.fn().mockResolvedValue(4) },
    settlement: { update: vi.fn().mockResolvedValue({}) },
    fileAsset: { update: vi.fn().mockResolvedValue({}) },
  };
  const service = new EsfService(prisma as never, {} as never, {} as never, {} as never, {} as never);
  vi.spyOn(service, 'findOneDto').mockResolvedValue({ id: 'invoice-1' } as never);
  const internal = service as unknown as {
    refreshExisting: (existing: typeof invoice, row: EsfListRow, org: string, user: string) => Promise<unknown>;
    attachToSettlement: (settlement: string, file: string, number: string, issuedOn: string, status: EsfStatus, user: string) => Promise<unknown>;
  };
  return { prisma, service, internal, invoice, step };
}

describe('Ручное подтверждение ЭСФ при работе с кабинетом', () => {
  const manual = [
    { evidenceUrl: 'https://example.com/esf', fileAssetId: null },
    { evidenceUrl: null, fileAssetId: 'uploaded-scan' },
  ];
  it.each(manual)('не открывает вручную закрытый шаг при отзыве связанной ЭСФ: %j', async (evidence) => {
    const { prisma, internal, invoice } = fixture(evidence);
    await internal.refreshExisting(invoice, { status: 'Отозван', number: '123', issuedOn: '06.10.2026' } as EsfListRow, 'org-1', 'user-1');
    expect(prisma.esfInvoice.update).toHaveBeenCalled();
    expect(prisma.settlementStep.update).not.toHaveBeenCalled();
  });

  it.each(manual)('не стирает ручное подтверждение при привязке документа кабинета: %j', async (evidence) => {
    const { prisma, internal } = fixture(evidence);
    await internal.attachToSettlement('settlement-1', 'portal-pdf', '123', '06.10.2026', EsfStatus.ACCEPTED, 'user-1');
    expect(prisma.settlementStep.update).not.toHaveBeenCalled();
  });

  it.each(manual)('сохраняет ручное подтверждение при отвязке ЭСФ: %j', async (evidence) => {
    const { prisma, service } = fixture(evidence);
    await service.detach('org-1', 'invoice-1');
    expect(prisma.settlementStep.update).not.toHaveBeenCalled();
    expect(prisma.esfInvoice.update).toHaveBeenCalledWith({ where: { id: 'invoice-1' }, data: { settlementId: null, matchNote: 'Отвязана вручную' } });
  });

  it('повторно открывает шаг, подтверждённый кабинетом, при отзыве ЭСФ', async () => {
    const { prisma, internal, invoice } = fixture({ evidenceUrl: null, fileAssetId: 'portal-pdf' });
    await internal.refreshExisting(invoice, { status: 'Отозван', number: '123', issuedOn: '06.10.2026' } as EsfListRow, 'org-1', 'user-1');
    expect(prisma.settlementStep.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ doneAt: null, doneById: null }) }));
  });

  it.each(manual)('после отмены ручного шага сохраняет новое подтверждение кабинета без старых вложений: %j', async (evidence) => {
    const { prisma, internal, invoice, step } = fixture(evidence);
    step.doneAt = null;
    await internal.refreshExisting({ ...invoice, status: EsfStatus.NEW }, { status: 'Принят', number: '123', issuedOn: '06.10.2026' } as EsfListRow, 'org-1', 'user-1');
    expect(prisma.settlementStep.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ doneAt: expect.any(Date), evidenceUrl: null, fileAssetId: 'portal-pdf' }) }));
  });
});
