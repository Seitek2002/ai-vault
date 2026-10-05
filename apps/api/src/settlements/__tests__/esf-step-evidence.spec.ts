import { BadRequestException, NotFoundException } from '@nestjs/common';
import { EsfStatus, SettlementStepType } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import type { CompleteStepDto } from '../dto/settlement.dto';
import { SettlementsService } from '../settlements.service';

function fixture(type: SettlementStepType = SettlementStepType.ISSUE_ESF) {
  const invoices: Array<{ organizationId: string; settlementId: string; status: EsfStatus; fileAssetId: string | null }> = [];
  const tx = {
    settlementStep: { update: vi.fn().mockResolvedValue({}) },
    fileAsset: { update: vi.fn().mockResolvedValue({}) },
    document: { updateMany: vi.fn().mockResolvedValue({ count: 0 }) },
  };
  const prisma = {
    settlement: {
      findFirst: vi.fn().mockResolvedValue({ id: 'settlement-1', organizationId: 'org-1' }),
      findUnique: vi.fn().mockResolvedValue({ closedAt: null }),
      update: vi.fn().mockResolvedValue({}),
    },
    settlementStep: {
      findFirst: vi.fn().mockResolvedValue({ id: 'step-1', type, fileAssetId: 'old-scan', evidenceUrl: 'https://example.com/old' }),
      count: vi.fn().mockResolvedValue(4),
    },
    fileAsset: { findFirst: vi.fn().mockResolvedValue({ id: 'scan-1', mimeType: 'application/pdf', size: 1024, settlementId: null }) },
    document: { findFirst: vi.fn().mockResolvedValue({ id: 'draft-1' }) },
    esfInvoice: {
      findFirst: vi.fn(async ({ where }) => invoices.find((invoice) =>
        invoice.organizationId === where.organizationId && invoice.settlementId === where.settlementId && where.status.in.includes(invoice.status),
      ) ?? null),
    },
    $transaction: vi.fn(async (fn: (client: typeof tx) => Promise<void>) => fn(tx)),
  };
  const service = new SettlementsService(prisma as never, {} as never);
  vi.spyOn(service, 'findOne').mockResolvedValue({ id: 'settlement-1' } as never);
  const complete = (dto: CompleteStepDto = {}) => service.completeStep('settlement-1', 'step-1', 'org-1', 'user-1', dto);
  return { prisma, tx, invoices, complete };
}

describe('Подтверждение шага ЭСФ', () => {
  it.each([{}, { note: 'ЭСФ № 123 от 06.10.2026' }, { documentId: 'draft-1' }])('не закрывает шаг без подтверждения: %j', async (dto) => {
    const { prisma, complete } = fixture();
    await expect(complete(dto)).rejects.toThrow('Свяжите отправленную или принятую ЭСФ');
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it.each([EsfStatus.NEW, EsfStatus.REVOKED, EsfStatus.REJECTED, EsfStatus.UNKNOWN])('не считает связанную ЭСФ %s подтверждением', async (status) => {
    const { invoices, prisma, complete } = fixture();
    invoices.push({ organizationId: 'org-1', settlementId: 'settlement-1', status, fileAssetId: 'portal-pdf' });
    await expect(complete()).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it.each([EsfStatus.SENT, EsfStatus.ACCEPTED])('завершает шаг по связанной ЭСФ %s без ручного номера', async (status) => {
    const { invoices, prisma, tx, complete } = fixture();
    invoices.push({ organizationId: 'org-1', settlementId: 'settlement-1', status, fileAssetId: 'portal-pdf' });
    await complete();
    expect(prisma.esfInvoice.findFirst).toHaveBeenCalledWith({
      where: { organizationId: 'org-1', settlementId: 'settlement-1', status: { in: ['SENT', 'ACCEPTED'] } }, select: { fileAssetId: true },
    });
    expect(tx.settlementStep.update).toHaveBeenCalledWith({ where: { id: 'step-1' }, data: {
      doneAt: expect.any(Date), doneById: 'user-1', evidenceUrl: null, fileAssetId: 'portal-pdf',
    } });
  });

  it.each([
    { organizationId: 'org-other', settlementId: 'settlement-1' },
    { organizationId: 'org-1', settlementId: 'settlement-other' },
  ])('не использует чужую принятую ЭСФ: %j', async (scope) => {
    const { invoices, complete } = fixture();
    invoices.push({ ...scope, status: EsfStatus.ACCEPTED, fileAssetId: null });
    await expect(complete()).rejects.toBeInstanceOf(BadRequestException);
  });

  it('сохраняет ссылку без обязательного скана, номера и кабинета, очищает прежний скан шага', async () => {
    const { tx, prisma, complete } = fixture();
    await complete({ evidenceUrl: ' https://esf.salyk.kg/esf/check-esf?documentUUID=test ' });
    expect(tx.settlementStep.update).toHaveBeenCalledWith({ where: { id: 'step-1' }, data: {
      doneAt: expect.any(Date), doneById: 'user-1', evidenceUrl: 'https://esf.salyk.kg/esf/check-esf?documentUUID=test', fileAssetId: null,
    } });
    expect(prisma.esfInvoice.findFirst).not.toHaveBeenCalled();
    expect(tx.fileAsset.update).not.toHaveBeenCalled();
  });

  it.each(['', 'не ссылка', 'esf.salyk.kg/esf', 'javascript:alert(1)', 'data:text/html,ESF', 'ftp://example.com/esf', 'https://user:password@example.com/esf', `https://example.com/${'a'.repeat(2048)}`])('отклоняет недопустимую ссылку %s', async (evidenceUrl) => {
    const { prisma, complete } = fixture();
    await expect(complete({ evidenceUrl })).rejects.toThrow('корректную ссылку');
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it.each(['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'])('принимает скан %s, привязывает к расчёту и очищает старую ссылку', async (mimeType) => {
    const { prisma, tx, complete } = fixture();
    prisma.fileAsset.findFirst.mockResolvedValue({ id: 'scan-1', mimeType, size: 1024, settlementId: null });
    await complete({ fileAssetId: 'scan-1' });
    expect(prisma.fileAsset.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'scan-1', organizationId: 'org-1' } }));
    expect(tx.settlementStep.update).toHaveBeenCalledWith({ where: { id: 'step-1' }, data: {
      doneAt: expect.any(Date), doneById: 'user-1', evidenceUrl: null, fileAssetId: 'scan-1',
    } });
    expect(tx.fileAsset.update).toHaveBeenCalledWith({ where: { id: 'scan-1' }, data: { settlementId: 'settlement-1' } });
    expect(tx.document.updateMany).not.toHaveBeenCalled();
  });

  it.each([
    { mimeType: 'application/pdf', size: 0, settlementId: null },
    { mimeType: 'text/plain', size: 1024, settlementId: null },
    { mimeType: 'application/pdf', size: 1024, settlementId: 'other-settlement' },
  ])('отклоняет пустой, неподходящий или занятый скан: %j', async (asset) => {
    const { prisma, complete } = fixture();
    prisma.fileAsset.findFirst.mockResolvedValue({ id: 'scan-1', ...asset } as never);
    await expect(complete({ fileAssetId: 'scan-1' })).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('отклоняет недоступный скан', async () => {
    const { prisma, complete } = fixture();
    prisma.fileAsset.findFirst.mockResolvedValue(null as never);
    await expect(complete({ fileAssetId: 'foreign-scan' })).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it.each([SettlementStepType.ISSUE_ACT, SettlementStepType.ISSUE_INVOICE])('не заменяет обязательный PDF ссылкой для %s', async (type) => {
    const { prisma, complete } = fixture(type);
    await expect(complete({ evidenceUrl: 'https://example.com/esf' })).rejects.toThrow('Прикрепите скан');
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
