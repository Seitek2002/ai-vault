import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Prisma } from '@prisma/client';
import { ContractsService } from '../contracts.service';
import type { PrismaService } from '../../prisma/prisma.service';

function setup() {
  const row = {
    id: 'c', number: 'ДГ-000001', counterpartyId: 'cp', counterparty: { name: 'Partner' },
    title: 'Service', defaultAmount: new Prisma.Decimal(100), vatRate: 0,
    contractPdf: null, ndaPdf: null, additionalPdfs: [], startDate: null, endDate: null, termValue: null, termUnit: null,
    createdAt: new Date('2026-08-01T00:00:00Z'),
  };
  const tx = {
    $executeRaw: vi.fn().mockResolvedValue(1),
    contractNumberCounter: { upsert: vi.fn().mockResolvedValue({ lastNumber: 1 }) },
    contract: {
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn(async ({ data }) => ({ ...row, ...data })), update: vi.fn().mockResolvedValue(row),
    },
  };
  const prisma = {
    $transaction: vi.fn(async (callback: (tx: unknown) => unknown) => callback(tx)),
    counterparty: { findFirst: vi.fn().mockResolvedValue({ id: 'cp' }) },
    contract: { findFirst: vi.fn().mockResolvedValue(row) },
  };
  return { tx, prisma, service: new ContractsService(prisma as unknown as PrismaService) };
}
const input = { counterpartyId: 'cp', title: 'Service', defaultAmount: 100 };

describe('contract numbers', () => {
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-08T12:00:00Z')); });
  afterEach(() => vi.useRealTimers());
  it('persists a changed amount as an exact decimal', async () => {
    const { tx, service } = setup();
    await service.update('c', 'org', { defaultAmount: 49291.66 });
    const data = tx.contract.update.mock.calls[0]![0].data;
    expect(data.defaultAmount).toBeInstanceOf(Prisma.Decimal);
    expect(data.defaultAmount.toFixed(2)).toBe('49291.66');
  });

  it.each([undefined, '', '   '])('assigns a number for empty input %s', async (number) => {
    const { tx, service } = setup();
    const result = await service.create('org', { ...input, ...(number !== undefined ? { number } : {}) });
    expect(tx.contract.create.mock.calls[0]![0].data.number).toBe('ДГ-000001/1026');
    expect(result.number).toBe('ДГ-000001/1026');
    expect(tx.$executeRaw.mock.calls[0]![1]).toBe('org');
    expect(tx.contractNumberCounter.upsert.mock.calls[0]![0]).toMatchObject({
      where: { organizationId: 'org' }, update: { lastNumber: { increment: 1 } },
    });
  });

  it('keeps a trimmed manual number without advancing the counter', async () => {
    const { tx, service } = setup();
    await service.create('org', { ...input, number: '  17/2026-A  ' });
    expect(tx.contract.create.mock.calls[0]![0].data.number).toBe('17/2026-A/1026');
    expect(tx.contractNumberCounter.upsert).not.toHaveBeenCalled();
  });

  it('skips automatic numbers already reserved manually', async () => {
    const { tx, service } = setup();
    tx.contractNumberCounter.upsert.mockResolvedValueOnce({ lastNumber: 1 }).mockResolvedValueOnce({ lastNumber: 2 });
    tx.contract.findFirst.mockResolvedValueOnce({ id: 'existing' } as never);
    await service.create('org', input);
    expect(tx.contract.create.mock.calls[0]![0].data.number).toBe('ДГ-000002/1026');
    expect(tx.contract.findFirst.mock.calls[0]![0].where).toEqual({ organizationId: 'org', number: 'ДГ-000001/1026' });
  });

  it('allows editing the number but rejects clearing it', async () => {
    const { tx, service } = setup();
    await service.update('c', 'org', { number: '  new/26  ' });
    expect(tx.contract.update.mock.calls[0]![0].data.number).toBe('new/26/0826');
    expect(tx.$executeRaw).toHaveBeenCalledTimes(1);
    await expect(service.update('c', 'org', { number: '   ' })).rejects.toThrow('не может быть пустым');
    expect(tx.contract.update).toHaveBeenCalledTimes(1);
  });

  it('preserves the number when editing other fields', async () => {
    const { tx, service } = setup();
    await service.update('c', 'org', { title: 'Updated' });
    expect(tx.contract.update.mock.calls[0]![0].data).not.toHaveProperty('number');
  });

  it('uses the contract start date for automatic and manual numbers', async () => {
    const { tx, service } = setup();
    await service.create('org', { ...input, startDate: '2026-08-05' });
    expect(tx.contract.create.mock.calls[0]![0].data.number).toBe('ДГ-000001/0826');
    await service.create('org', { ...input, number: '022', startDate: '2025-12-31' });
    expect(tx.contract.create.mock.calls[1]![0].data.number).toBe('022/1225');
  });

  it('keeps explicit suffixes and does not renumber when start dates change', async () => {
    const { tx, service } = setup();
    await service.create('org', { ...input, number: '17/0826', startDate: '2026-10-01' });
    expect(tx.contract.create.mock.calls[0]![0].data.number).toBe('17/0826');
    await service.update('c', 'org', { number: '17/0826', startDate: '2026-11-01' });
    expect(tx.contract.update.mock.calls[0]![0].data.number).toBe('17/0826');
    await service.update('c', 'org', { startDate: '2026-12-01' });
    expect(tx.contract.update.mock.calls[1]![0].data).not.toHaveProperty('number');
  });

  it('validates the complete number length and rejects a slash without a base', async () => {
    const { tx, service } = setup();
    await expect(service.create('org', { ...input, number: 'x'.repeat(96) })).rejects.toThrow('100 символов');
    await expect(service.update('c', 'org', { number: '/' })).rejects.toThrow('Укажите номер');
    expect(tx.contract.create).not.toHaveBeenCalled();
    expect(tx.contract.update).not.toHaveBeenCalled();
  });

  it('reports duplicate manual numbers on create and update', async () => {
    const { tx, service } = setup();
    const error = new Prisma.PrismaClientKnownRequestError('duplicate', {
      code: 'P2002', clientVersion: '6', meta: { target: ['organizationId', 'number'] },
    });
    tx.contract.create.mockRejectedValue(error);
    tx.contract.update.mockRejectedValue(error);
    await expect(service.create('org', { ...input, number: 'duplicate' })).rejects.toThrow('таким номером уже существует');
    await expect(service.update('c', 'org', { number: 'duplicate' })).rejects.toThrow('таким номером уже существует');
  });
});
