import { describe, expect, it, vi } from 'vitest';
import { Prisma } from '@prisma/client';
import { ContractsService } from '../contracts.service';
import type { PrismaService } from '../../prisma/prisma.service';

function setup(overrides: Record<string, unknown> = {}) {
  const row = {
    id: 'c', number: 'manual', counterpartyId: 'cp', counterparty: { name: 'Partner' },
    title: 'Service', defaultAmount: new Prisma.Decimal(100), vatRate: 0,
    contractPdf: null, ndaPdf: null, additionalPdfs: [],
    startDate: new Date('2026-01-31'), endDate: new Date('2026-02-28'),
    termValue: 1, termUnit: 'MONTHS', ...overrides,
  };
  const tx = {
    $executeRaw: vi.fn().mockResolvedValue(1),
    contract: { create: vi.fn().mockResolvedValue(row), update: vi.fn().mockResolvedValue(row) },
  };
  const prisma = {
    $transaction: vi.fn(async (callback: (tx: unknown) => unknown) => callback(tx)),
    counterparty: { findFirst: vi.fn().mockResolvedValue({ id: 'cp' }) },
    contract: { findFirst: vi.fn().mockResolvedValue(row) },
  };
  return { tx, service: new ContractsService(prisma as unknown as PrismaService) };
}
const input = { number: 'manual', counterpartyId: 'cp', title: 'Service', defaultAmount: 100 };

describe('contract term storage', () => {
  it('saves a manual end date when switching away from a duration', async () => {
    const { tx, service } = setup();
    await service.update('c', 'org', { termValue: null, termUnit: null, endDate: '2026-12-31', autoRenew: true });
    expect(tx.contract.update.mock.calls[0]![0].data).toMatchObject({ termValue: null, termUnit: null, endDate: new Date('2026-12-31'), autoRenew: true });
  });
  it('requires a positive finite duration for automatic renewal', async () => {
    const { service } = setup();
    await expect(service.create('org', { ...input, autoRenew: true })).rejects.toThrow('Для автопродления');
    await expect(service.update('c', 'org', { termValue: null, termUnit: null, autoRenew: true })).rejects.toThrow('Для автопродления');
  });
  it('defaults new contracts to monthly billing without hidden VAT', async () => {
    const { tx, service } = setup();
    await service.create('org', input);
    expect(tx.contract.create.mock.calls[0]![0].data).toMatchObject({ billingPeriod: 'MONTHLY', vatRate: 0 });
    await service.update('c', 'org', { title: 'Updated' });
    expect(tx.contract.update.mock.calls[0]![0].data).not.toHaveProperty('vatRate');
  });
  it('calculates expiration on the server and ignores a client supplied end date', async () => {
    const { tx, service } = setup();
    const result = await service.create('org', { ...input, startDate: '2026-01-31', termValue: 1,
      termUnit: 'MONTHS', endDate: '2040-01-01' });
    expect(tx.contract.create.mock.calls[0]![0].data).toMatchObject({
      termValue: 1, termUnit: 'MONTHS', endDate: new Date('2026-02-28'),
    });
    expect(result.termValue).toBe(1);
    expect(result.termUnit).toBe('MONTHS');
  });

  it('recalculates when start changes while retaining the selected term', async () => {
    const { tx, service } = setup();
    await service.update('c', 'org', { startDate: '2026-03-31' });
    expect(tx.contract.update.mock.calls[0]![0].data).toMatchObject({
      termValue: 1, termUnit: 'MONTHS', endDate: new Date('2026-04-30'),
    });
  });

  it('changes the term to years', async () => {
    const { tx, service } = setup({ startDate: new Date('2024-02-29') });
    await service.update('c', 'org', { termValue: 1, termUnit: 'YEARS' });
    expect(tx.contract.update.mock.calls[0]![0].data.endDate).toEqual(new Date('2025-02-28'));
  });

  it('clears expiration for an indefinite contract', async () => {
    const { tx, service } = setup();
    await service.update('c', 'org', { termValue: null, termUnit: null });
    expect(tx.contract.update.mock.calls[0]![0].data).toMatchObject({ termValue: null, termUnit: null, endDate: null });
  });

  it('preserves legacy exact dates without inventing a duration', async () => {
    const { tx, service } = setup({ termValue: null, termUnit: null, endDate: new Date('2026-02-17') });
    await service.update('c', 'org', { startDate: '2026-01-01' });
    expect(tx.contract.update.mock.calls[0]![0].data).toMatchObject({ termValue: null, termUnit: null, endDate: new Date('2026-02-17') });
    await service.update('c', 'org', { title: 'Updated' });
    expect(tx.contract.update.mock.calls[1]![0].data).not.toHaveProperty('endDate');
  });

  it('requires a start date for a finite term and cannot clear it later', async () => {
    const { tx, service } = setup();
    await expect(service.create('org', { ...input, termValue: 1, termUnit: 'MONTHS' })).rejects.toThrow('дату начала');
    await expect(service.update('c', 'org', { startDate: null })).rejects.toThrow('дату начала');
    expect(tx.contract.create).not.toHaveBeenCalled();
    expect(tx.contract.update).not.toHaveBeenCalled();
  });

  it('rejects partial terms and invalid lengths', async () => {
    const { service } = setup();
    await expect(service.create('org', { ...input, termValue: 1 })).rejects.toThrow('срок и единицу');
    await expect(service.create('org', { ...input, startDate: '2026-01-01', termValue: 0, termUnit: 'MONTHS' })).rejects.toThrow('целым числом');
    await expect(service.create('org', { ...input, startDate: '2026-01-01', termValue: 1.5, termUnit: 'MONTHS' })).rejects.toThrow('целым числом');
    await expect(service.create('org', { ...input, startDate: '2026-01-01', termValue: 101, termUnit: 'YEARS' })).rejects.toThrow('целым числом');
  });
});
