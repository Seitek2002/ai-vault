import 'reflect-metadata';
import { BadRequestException } from '@nestjs/common';
import { Prisma, SettlementStepType } from '@prisma/client';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { describe, expect, it, vi } from 'vitest';
import { UpdateSettlementDto } from '../dto/settlement.dto';
import { SettlementsService } from '../settlements.service';

function fixture(issued: SettlementStepType[] = [], finalized = 0) {
  const settlement = { id: 'settlement-1', contractId: 'contract-1', counterpartyId: 'partner-1', amount: new Prisma.Decimal(100) };
  const docs = { refreshDraftsForSettlement: vi.fn().mockResolvedValue(2) };
  const tx = {
    settlement: { update: vi.fn().mockResolvedValue(settlement) },
    counterparty: { findUniqueOrThrow: vi.fn().mockResolvedValue({ id: 'partner-1' }) },
    companySettings: { findUnique: vi.fn().mockResolvedValue(null) },
  };
  const prisma = {
    settlement: { findFirst: vi.fn().mockResolvedValue(settlement) },
    document: { count: vi.fn().mockResolvedValue(finalized) },
    settlementStep: { count: vi.fn(async ({ where }) => issued.filter(type => where.type.in.includes(type)).length) },
    contract: { findUnique: vi.fn().mockResolvedValue({ vatRate: 12, esfRequired: true }) },
    $transaction: vi.fn(async (fn: (client: typeof tx) => Promise<void>) => fn(tx)),
  };
  const service = new SettlementsService(prisma as never, docs as never);
  // Оплата/закрытие имеют отдельные тесты; здесь важна защита выставленных документов.
  vi.spyOn(service as never, 'syncPaymentStep' as never).mockResolvedValue(undefined as never);
  vi.spyOn(service, 'findOne').mockResolvedValue({ id: 'settlement-1' } as never);
  const update = (dto: UpdateSettlementDto) => service.update('settlement-1', 'org-1', 'user-1', dto);
  return { prisma, tx, docs, update };
}

describe('Редактирование суммы за месяц', () => {
  it('сохраняет сумму, пересчитывает НДС и обновляет черновики одной транзакцией', async () => {
    const { tx, docs, update } = fixture();
    await update({ amount: 60000 });
    const data = tx.settlement.update.mock.calls[0]![0].data;
    expect(data.amount.toFixed(2)).toBe('60000.00');
    expect(data.vatAmount.toFixed(2)).toBe('6428.57');
    expect(docs.refreshDraftsForSettlement).toHaveBeenCalledWith(tx, expect.objectContaining({ userId: 'user-1', organizationId: 'org-1' }));
  });

  it.each([SettlementStepType.ISSUE_ACT, SettlementStepType.ISSUE_INVOICE, SettlementStepType.ISSUE_ESF])('фиксирует сумму при выполненном %s даже без созданного документа', async (type) => {
    const { prisma, update } = fixture([type]);
    await expect(update({ amount: 20000 })).rejects.toBeInstanceOf(BadRequestException);
    await expect(update({ vatAmount: 1000 })).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(prisma.settlementStep.count).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ settlementId: 'settlement-1', doneAt: { not: null } }) }));
  });

  it('сохраняет существующий запрет правки финальных документов', async () => {
    const { prisma, update } = fixture([], 1);
    await expect(update({ amount: 20000 })).rejects.toThrow('Документы расчёта уже выставлены');
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});

describe('Валидация суммы API', () => {
  it.each([null, -1, 1000000000000, 1.234, '20000'])('отклоняет недопустимое значение %j до обращения к БД', async (amount) => {
    const dto = plainToInstance(UpdateSettlementDto, { amount });
    expect((await validate(dto)).some(error => error.property === 'amount')).toBe(true);
  });
  it.each([0, 20000, 49291.66, 999999999999.99])('принимает сумму %s', async (amount) => {
    expect(await validate(plainToInstance(UpdateSettlementDto, { amount }))).toEqual([]);
  });
  it('сохраняет необязательность суммы при других правках', async () => {
    expect(await validate(plainToInstance(UpdateSettlementDto, {}))).toEqual([]);
  });
});
