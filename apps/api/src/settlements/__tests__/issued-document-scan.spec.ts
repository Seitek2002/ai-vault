import { BadRequestException, NotFoundException } from '@nestjs/common';
import { DocumentStatus, SettlementStepType } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { SettlementsService } from '../settlements.service';

function fixture(type: SettlementStepType = SettlementStepType.ISSUE_ACT) {
  const tx = {
    settlementStep: { update: vi.fn().mockResolvedValue({}) },
    fileAsset: { update: vi.fn().mockResolvedValue({}) },
    document: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
  };
  const prisma = {
    settlement: {
      findFirst: vi.fn().mockResolvedValue({ id: 'settlement-1', organizationId: 'org-1' }),
      findUnique: vi.fn().mockResolvedValue({ closedAt: null }),
      update: vi.fn().mockResolvedValue({}),
    },
    settlementStep: {
      findFirst: vi.fn().mockResolvedValue({ id: 'step-1', type, documentId: null }),
      count: vi.fn().mockResolvedValue(4),
    },
    fileAsset: {
      findFirst: vi.fn().mockResolvedValue({
        id: 'scan-1', mimeType: 'application/pdf', size: 1024, settlementId: null,
      }),
    },
    document: { findFirst: vi.fn().mockResolvedValue({ id: 'draft-1' }) },
    $transaction: vi.fn(async (fn: (client: typeof tx) => Promise<void>) => fn(tx)),
  };
  const service = new SettlementsService(prisma as never, {} as never);
  vi.spyOn(service, 'findOne').mockResolvedValue({ id: 'settlement-1' } as never);
  const complete = (dto: { fileAssetId?: string; documentId?: string } = {}) =>
    service.completeStep('settlement-1', 'step-1', 'org-1', 'user-1', dto);
  return { prisma, tx, complete };
}

describe.each([
  { type: SettlementStepType.ISSUE_ACT, scanDocument: 'акта', documentType: 'AVR' },
  { type: SettlementStepType.ISSUE_INVOICE, scanDocument: 'счёта на оплату', documentType: 'INVOICE_PAYMENT' },
])('PDF для $scanDocument', ({ type, scanDocument, documentType }) => {
  it.each([undefined, 'draft-1'])('требует PDF даже при наличии черновика %s', async (documentId) => {
    const { prisma, tx, complete } = fixture(type);
    await expect(complete(documentId ? { documentId } : {})).rejects.toThrow(
      `Прикрепите скан ${scanDocument} в формате PDF`,
    );
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(tx.settlementStep.update).not.toHaveBeenCalled();
  });

  it.each(['image/jpeg', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'])
    ('отклоняет %s до изменения шага и документов', async (mimeType) => {
      const { prisma, tx, complete } = fixture(type);
      prisma.fileAsset.findFirst.mockResolvedValue({
        id: 'scan-1', mimeType, size: 1024, settlementId: null,
      });
      await expect(complete({ fileAssetId: 'scan-1' })).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(tx.document.updateMany).not.toHaveBeenCalled();
    });

  it('отклоняет пустой PDF', async () => {
    const { prisma, complete } = fixture(type);
    prisma.fileAsset.findFirst.mockResolvedValue({
      id: 'scan-1', mimeType: 'application/pdf', size: 0, settlementId: null,
    });
    await expect(complete({ fileAssetId: 'scan-1' })).rejects.toThrow('непустым файлом PDF');
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('ищет файл только в текущей организации и отклоняет недоступный файл', async () => {
    const { prisma, complete } = fixture(type);
    prisma.fileAsset.findFirst.mockResolvedValue(null as never);
    await expect(complete({ fileAssetId: 'foreign-scan' })).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.fileAsset.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'foreign-scan', organizationId: 'org-1' },
    }));
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('сохраняет скан у шага и расчёта вместе с финализацией документа', async () => {
    const { prisma, tx, complete } = fixture(type);
    await complete({ fileAssetId: 'scan-1', documentId: 'draft-1' });
    expect(prisma.$transaction).toHaveBeenCalledOnce();
    expect(tx.settlementStep.update).toHaveBeenCalledWith({
      where: { id: 'step-1' },
      data: {
        doneAt: expect.any(Date), doneById: 'user-1', documentId: 'draft-1', fileAssetId: 'scan-1',
      },
    });
    expect(tx.fileAsset.update).toHaveBeenCalledWith({
      where: { id: 'scan-1' }, data: { settlementId: 'settlement-1' },
    });
    expect(tx.document.updateMany).toHaveBeenCalledWith({
      where: { settlementId: 'settlement-1', type: documentType, status: DocumentStatus.DRAFT },
      data: { status: DocumentStatus.FINAL },
    });
  });

  it('завершает шаг со сканом, когда шаблона и черновика нет', async () => {
    const { tx, complete } = fixture(type);
    await expect(complete({ fileAssetId: 'scan-1' })).resolves.toMatchObject({ id: 'settlement-1' });
    expect(tx.fileAsset.update).toHaveBeenCalled();
    expect(tx.settlementStep.update.mock.calls[0]![0].data).not.toHaveProperty('documentId');
  });

  it('не переносит скан из другого расчёта', async () => {
    const { prisma, complete } = fixture(type);
    prisma.fileAsset.findFirst.mockResolvedValue({
      id: 'scan-1', mimeType: 'application/pdf', size: 1024, settlementId: 'settlement-other',
    } as never);
    await expect(complete({ fileAssetId: 'scan-1' })).rejects.toThrow('другому расчёту');
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

});

describe('Остальные шаги', () => {
  it('завершает отправку без обязательного скана', async () => {
    const { complete } = fixture(SettlementStepType.SEND);
    await expect(complete()).resolves.toMatchObject({ id: 'settlement-1' });
  });

  it('сохраняет возможность прикрепить фото подписанного документа', async () => {
    const { prisma, tx, complete } = fixture(SettlementStepType.RECEIVE_SIGNED);
    prisma.fileAsset.findFirst.mockResolvedValue({
      id: 'scan-1', mimeType: 'image/jpeg', size: 1024, settlementId: null,
    });
    await complete({ fileAssetId: 'scan-1' });
    expect(tx.document.updateMany).toHaveBeenCalledWith({
      where: { settlementId: 'settlement-1', type: 'AVR' },
      data: { status: DocumentStatus.SIGNED },
    });
  });
});
