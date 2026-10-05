import { describe, expect, it, vi } from 'vitest';
import { Prisma } from '@prisma/client';
import { ContractsService } from '../contracts.service';
import type { PrismaService } from '../../prisma/prisma.service';

function setup() {
  const row = {
    id: 'c', number: 'ДГ-000001', counterpartyId: 'cp', counterparty: { name: 'Partner' },
    title: 'Service', defaultAmount: new Prisma.Decimal(100), vatRate: 0,
    contractPdf: null, ndaPdf: null, additionalPdfs: [], startDate: null, endDate: null, termValue: null, termUnit: null,
  };
  const tx = {
    $executeRaw: vi.fn().mockResolvedValue(1),
    contractNumberCounter: { upsert: vi.fn().mockResolvedValue({ lastNumber: 1 }) },
    contract: {
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue(row), update: vi.fn().mockResolvedValue(row),
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
    expect(tx.contract.create.mock.calls[0]![0].data.number).toBe('ДГ-000001');
    expect(result.number).toBe('ДГ-000001');
    expect(tx.$executeRaw.mock.calls[0]![1]).toBe('org');
    expect(tx.contractNumberCounter.upsert.mock.calls[0]![0]).toMatchObject({
      where: { organizationId: 'org' }, update: { lastNumber: { increment: 1 } },
    });
  });

  it('keeps a trimmed manual number without advancing the counter', async () => {
    const { tx, service } = setup();
    await service.create('org', { ...input, number: '  17/2026-A  ' });
    expect(tx.contract.create.mock.calls[0]![0].data.number).toBe('17/2026-A');
    expect(tx.contractNumberCounter.upsert).not.toHaveBeenCalled();
  });

  it('skips automatic numbers already reserved manually', async () => {
    const { tx, service } = setup();
    tx.contractNumberCounter.upsert.mockResolvedValueOnce({ lastNumber: 1 }).mockResolvedValueOnce({ lastNumber: 2 });
    tx.contract.findFirst.mockResolvedValueOnce({ id: 'existing' } as never);
    await service.create('org', input);
    expect(tx.contract.create.mock.calls[0]![0].data.number).toBe('ДГ-000002');
    expect(tx.contract.findFirst.mock.calls[0]![0].where).toEqual({ organizationId: 'org', number: 'ДГ-000001' });
  });

  it('allows editing the number but rejects clearing it', async () => {
    const { tx, service } = setup();
    await service.update('c', 'org', { number: '  new/26  ' });
    expect(tx.contract.update.mock.calls[0]![0].data.number).toBe('new/26');
    expect(tx.$executeRaw).toHaveBeenCalledTimes(1);
    await expect(service.update('c', 'org', { number: '   ' })).rejects.toThrow('не может быть пустым');
    expect(tx.contract.update).toHaveBeenCalledTimes(1);
  });

  it('preserves the number when editing other fields', async () => {
    const { tx, service } = setup();
    await service.update('c', 'org', { title: 'Updated' });
    expect(tx.contract.update.mock.calls[0]![0].data).not.toHaveProperty('number');
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
