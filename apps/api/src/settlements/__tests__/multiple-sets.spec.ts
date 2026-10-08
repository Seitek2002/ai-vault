import 'reflect-metadata';
import { Prisma, type Contract } from '@prisma/client';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { describe, expect, it, vi } from 'vitest';
import { CreateSettlementDto } from '../dto/settlement.dto';
import { SettlementsService } from '../settlements.service';

function fixture(withTemplates = true) {
  const contract = {
    id: 'contract-1', organizationId: 'org-1', counterpartyId: 'bakai',
    defaultAmount: new Prisma.Decimal(20000), vatRate: 12, esfRequired: true,
    currency: 'KGS', paymentDueDays: 10, active: true,
  } as Contract;
  type Saved = { id: string; contractId: string; year: number; month: number; sequence: number; label: string | null; amount: Prisma.Decimal; vatAmount: Prisma.Decimal; steps: { create: unknown[] } };
  const rows: Saved[] = [];
  const locks = new Map<string, Promise<void>>();
  const settlement = {
    findFirst: vi.fn(async ({ where }: { where: { contractId: string; year?: number; month?: number } }) =>
      rows.filter(r => r.contractId === where.contractId && (where.year === undefined || r.year === where.year) && (where.month === undefined || r.month === where.month))
        .sort((a, b) => b.sequence - a.sequence)[0] ?? null),
    findUnique: vi.fn(async ({ where }: { where: { contractId_year_month_sequence: { contractId: string; year: number; month: number; sequence: number } } }) => {
      const key = where.contractId_year_month_sequence;
      return rows.find(r => r.contractId === key.contractId && r.year === key.year && r.month === key.month && r.sequence === key.sequence) ?? null;
    }),
    create: vi.fn(async ({ data }: { data: Omit<Saved, 'id'> }) => {
      const row = { id: `set-${rows.length + 1}`, ...data };
      rows.push(row);
      return row;
    }),
  };
  const txBase = {
    settlement,
    contract: { findFirst: vi.fn(async ({ where }: { where: { id: string; organizationId: string } }) =>
      where.id === contract.id && where.organizationId === contract.organizationId ? contract : null) },
    counterparty: { findUniqueOrThrow: vi.fn().mockResolvedValue({ id: 'bakai' }) },
    companySettings: { findUnique: vi.fn().mockResolvedValue(null) },
    settlementStep: { update: vi.fn().mockResolvedValue({}) },
  };
  const lockCalls: string[] = [];
  const prisma = {
    $transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => {
      let release: (() => void) | undefined;
      const tx = { ...txBase, $executeRaw: async (_strings: unknown, key: string) => {
        lockCalls.push(key);
        const previous = locks.get(key) ?? Promise.resolve();
        const held = new Promise<void>(resolve => { release = resolve; });
        locks.set(key, previous.then(() => held));
        await previous;
        return 1;
      } };
      try { return await fn(tx); } finally { release?.(); }
    }),
  };
  const docs = { createDraftsForSettlement: vi.fn(async (_tx, { settlement: s }) => withTemplates
    ? [{ id: `act-${s.id}`, type: 'AVR' }, { id: `invoice-${s.id}`, type: 'INVOICE_PAYMENT' }] : []) };
  const service = new SettlementsService(prisma as never, docs as never);
  vi.spyOn(service, 'findOne').mockImplementation(async id => rows.find(r => r.id === id) as never);
  const create = (amount = 15000, label?: string, month = 10) => service.create('org-1', 'user-1', {
    contractId: contract.id, year: 2026, month, amount, ...(label !== undefined ? { label } : {}),
  });
  return { service, contract, create, rows, docs, tx: txBase, lockCalls };
}

describe('Несколько актов и счетов одного договора за месяц', () => {
  it('разовый платёж не повторяется в другом месяце при одновременной генерации', async () => {
    const f = fixture(); f.contract.billingPeriod = 'ONE_TIME';
    await Promise.all([f.service.generateOne(f.contract, 2026, 10, 'user-1'), f.service.generateOne(f.contract, 2026, 11, 'user-1')]);
    expect(f.rows).toHaveLength(1);
    expect(new Set(f.lockCalls)).toEqual(new Set(['settlement:org-1:contract-1:one-time']));
  });
  it('ежегодный платёж создаётся только в месяц подписания', async () => {
    const f = fixture(); f.contract.billingPeriod = 'YEARLY'; f.contract.startDate = new Date('2025-10-08');
    expect(await f.service.generateOne(f.contract, 2026, 9, 'user-1')).toBeNull();
    expect(await f.service.generateOne(f.contract, 2026, 10, 'user-1')).toBe('set-1');
  });
  it('сохраняет основной комплект и создаёт второй с независимой суммой, НДС и документами', async () => {
    const f = fixture();
    await f.service.generateOne(f.contract, 2026, 10, 'user-1');
    await f.create(11200, '  Второй этап  ');
    expect(f.rows.map(r => [r.sequence, r.amount.toNumber(), r.label])).toEqual([[1, 20000, null], [2, 11200, 'Второй этап']]);
    expect(f.rows[1]!.vatAmount.toNumber()).toBe(1200);
    expect(f.docs.createDraftsForSettlement).toHaveBeenCalledTimes(2);
    expect(f.tx.settlementStep.update.mock.calls.map(([call]) => call)).toEqual([
      { where: { settlementId_type: { settlementId: 'set-1', type: 'ISSUE_ACT' } }, data: { documentId: 'act-set-1' } },
      { where: { settlementId_type: { settlementId: 'set-1', type: 'ISSUE_INVOICE' } }, data: { documentId: 'invoice-set-1' } },
      { where: { settlementId_type: { settlementId: 'set-2', type: 'ISSUE_ACT' } }, data: { documentId: 'act-set-2' } },
      { where: { settlementId_type: { settlementId: 'set-2', type: 'ISSUE_INVOICE' } }, data: { documentId: 'invoice-set-2' } },
    ]);
  });

  it('повторная генерация не создаёт дубликаты и не меняет дополнительные комплекты', async () => {
    const f = fixture();
    await f.create(5000);
    await f.create(10000);
    await expect(f.service.generateOne(f.contract, 2026, 10, 'user-1')).resolves.toBeNull();
    expect(f.rows.map(r => r.amount.toNumber())).toEqual([5000, 10000]);
    expect(f.docs.createDraftsForSettlement).toHaveBeenCalledTimes(2);
  });

  it('сериализует одновременные добавления и выдаёт разные номера', async () => {
    const f = fixture();
    await Promise.all([f.create(1000), f.create(2000), f.create(3000)]);
    expect(f.rows.map(r => r.sequence)).toEqual([1, 2, 3]);
    expect(new Set(f.lockCalls)).toEqual(new Set(['settlement:org-1:contract-1:2026:10']));
  });

  it('ручное добавление и автогенерация используют одну блокировку', async () => {
    const f = fixture();
    await Promise.all([f.service.generateOne(f.contract, 2026, 10, 'user-1'), f.create(3000)]);
    expect(f.rows.map(r => r.sequence)).toEqual([1, 2]);
  });

  it('в другом месяце нумерация начинается с первого комплекта', async () => {
    const f = fixture();
    await f.create(); await f.create(); await f.create(9000, undefined, 11);
    expect(f.rows.map(r => [r.month, r.sequence])).toEqual([[10, 1], [10, 2], [11, 1]]);
  });

  it('без шаблонов создаёт отдельные шаги для загрузки PDF', async () => {
    const f = fixture(false);
    await f.create(); await f.create();
    expect(f.rows.every(r => r.steps.create.length === 6)).toBe(true);
    expect(f.tx.settlementStep.update).not.toHaveBeenCalled();
  });

  it('не допускает договор другой организации', async () => {
    const f = fixture();
    await expect(f.service.create('other-org', 'user-1', { contractId: f.contract.id, year: 2026, month: 10, amount: 1 })).rejects.toThrow('Договор не найден');
    expect(f.rows).toHaveLength(0);
    expect(f.lockCalls).toHaveLength(0);
  });

  it('не скрывает ошибку генерации документов', async () => {
    const f = fixture();
    f.docs.createDraftsForSettlement.mockRejectedValueOnce(new Error('draft failure'));
    await expect(f.create()).rejects.toThrow('draft failure');
  });
});

describe('Проверка данных нового комплекта', () => {
  it.each([
    { amount: null }, { amount: -1 }, { amount: 1.001 }, { amount: 1000000000000 },
    { month: 0 }, { month: 13 }, { year: 1999 }, { year: 2101 }, { contractId: '' }, { label: 'a'.repeat(201) },
  ])('отклоняет некорректные данные %j', async patch => {
    const dto = plainToInstance(CreateSettlementDto, { contractId: 'contract-1', year: 2026, month: 10, amount: 20000, ...patch });
    expect((await validate(dto)).length).toBeGreaterThan(0);
  });

  it('разрешает комплект без назначения', async () => {
    const dto = plainToInstance(CreateSettlementDto, { contractId: 'contract-1', year: 2026, month: 10, amount: 20000 });
    expect(await validate(dto)).toEqual([]);
  });
});
