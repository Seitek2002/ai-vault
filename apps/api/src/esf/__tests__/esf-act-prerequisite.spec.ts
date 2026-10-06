import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Prisma, SettlementStepType } from '@prisma/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { seal } from '../../common/secret-box';
import { EsfService } from '../esf.service';

afterEach(() => vi.unstubAllEnvs());

function fixture() {
  vi.stubEnv('ESF_SECRET_KEY', 'ab'.repeat(32));
  const settlement = {
    id: 'set-1', contractId: 'contract', counterpartyId: 'company', year: 2026, month: 9, amount: new Prisma.Decimal(35000),
    contract: { title: 'Services' }, counterparty: { name: 'Test company' },
    steps: [{ type: SettlementStepType.ISSUE_ESF, doneAt: null, fileAssetId: null as string | null },
      { type: SettlementStepType.ISSUE_ACT, doneAt: new Date() as Date | null, fileAssetId: 'act-pdf' as string | null }],
    documents: [{ type: 'AVR', number: 'AVR-1' }],
  };
  const prisma = {
    companySettings: { findUnique: vi.fn().mockResolvedValue({ esfLogin: 'test', esfPasswordEnc: seal('test-password') }) },
    settlement: { findFirst: vi.fn().mockResolvedValue(settlement) },
    fileAsset: { findFirst: vi.fn().mockResolvedValue({ mimeType: 'application/pdf', size: 100 }) },
    esfInvoice: { findFirst: vi.fn().mockResolvedValueOnce(null).mockResolvedValueOnce({ uuid: 'source' })
      .mockResolvedValueOnce({ id: 'new-esf', uuid: 'new', settlementId: 'set-1', settlementLinks: [{ settlementId: 'set-1' }] }) },
  };
  const draft = { createByCopy: vi.fn().mockResolvedValue({ uuid: 'new' }) };
  const service = new EsfService(prisma as never, {} as never, {} as never, draft as never, {} as never, {} as never);
  const sync = vi.spyOn(service, 'sync').mockResolvedValue({ fetched: 1, created: 1, updated: 0, matched: 1, unmatched: 0, errors: [] });
  vi.spyOn(service, 'findOneDto').mockResolvedValue({ id: 'new-esf' } as never);
  return { settlement, prisma, draft, service, sync, create: () => service.createDraft('org', 'user', 'set-1', {
    sourceUuid: 'source', sourceSignature: 'a'.repeat(64), lines: [{ name: 'Services', quantity: 1, price: 35000 }],
  }) };
}

describe('Создание ЭСФ после загрузки акта', () => {
  it('черновик акта без скана не разрешает обращаться на портал', async () => {
    const f = fixture();
    f.settlement.steps = f.settlement.steps.filter((s) => s.type !== SettlementStepType.ISSUE_ACT);
    await expect(f.create()).rejects.toThrow('Сначала прикрепите PDF акта');
    expect(f.draft.createByCopy).not.toHaveBeenCalled();
    expect(f.sync).not.toHaveBeenCalled();
    expect(f.prisma.esfInvoice.findFirst).not.toHaveBeenCalled();
  });

  it('отметки о выполнении шага без файла недостаточно', async () => {
    const f = fixture();
    f.settlement.steps[1]!.fileAssetId = null;
    await expect(f.create()).rejects.toBeInstanceOf(BadRequestException);
    expect(f.prisma.fileAsset.findFirst).not.toHaveBeenCalled();
    expect(f.draft.createByCopy).not.toHaveBeenCalled();
  });

  it.each([
    { organizationId: 'org', settlementId: 'other-settlement' },
    { organizationId: 'other-org', settlementId: 'set-1' },
    null,
  ])('не использует недоступный акт %o', async (storedFile) => {
    const f = fixture();
    f.prisma.fileAsset.findFirst.mockImplementation(async ({ where }) =>
      storedFile && storedFile.organizationId === where.organizationId && storedFile.settlementId === where.settlementId
        ? { mimeType: 'application/pdf', size: 100 } : null);
    await expect(f.create()).rejects.toThrow('PDF акта к этому расчёту');
    expect(f.prisma.fileAsset.findFirst).toHaveBeenCalledWith({
      where: { id: 'act-pdf', organizationId: 'org', settlementId: 'set-1' }, select: { mimeType: true, size: true },
    });
    expect(f.draft.createByCopy).not.toHaveBeenCalled();
    expect(f.sync).not.toHaveBeenCalled();
  });

  it.each([{ mimeType: 'image/jpeg', size: 100 }, { mimeType: 'application/pdf', size: 0 }])('отклоняет неподходящий скан %o', async (scan) => {
    const f = fixture();
    f.prisma.fileAsset.findFirst.mockResolvedValue(scan);
    await expect(f.create()).rejects.toBeInstanceOf(BadRequestException);
    expect(f.draft.createByCopy).not.toHaveBeenCalled();
  });

  it('разрешает создание с загруженным PDF текущего расчёта, даже без документа из конструктора', async () => {
    const f = fixture();
    f.settlement.documents = [];
    await expect(f.create()).resolves.toEqual({ id: 'new-esf' });
    expect(f.draft.createByCopy).toHaveBeenCalledOnce();
    expect(f.sync).toHaveBeenCalledOnce();
  });

  it('сохраняет проверку организации расчёта', async () => {
    const f = fixture();
    f.prisma.settlement.findFirst.mockResolvedValue(null);
    await expect(f.create()).rejects.toBeInstanceOf(NotFoundException);
    expect(f.prisma.settlement.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'set-1', organizationId: 'org' } }));
    expect(f.prisma.fileAsset.findFirst).not.toHaveBeenCalled();
    expect(f.draft.createByCopy).not.toHaveBeenCalled();
  });
});
