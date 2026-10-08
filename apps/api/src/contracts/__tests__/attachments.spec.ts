import { describe, expect, it, vi } from 'vitest';
import { Prisma } from '@prisma/client';
import { ContractsService } from '../contracts.service';
import type { PrismaService } from '../../prisma/prisma.service';

function setup() {
  const row = {
    id: 'contract', number: 'ДГ-000001', counterpartyId: 'partner', counterparty: { name: 'Partner' },
    documentId: null, title: 'Service', defaultAmount: new Prisma.Decimal(100),
    vatRate: 0, currency: 'KGS', billingDay: 1, paymentDueDays: 10,
    esfRequired: true, active: true, startDate: null, endDate: null, termValue: null, termUnit: null,
    contractPdf: { id: 'pdf', originalName: 'contract.pdf', size: 10 }, ndaPdf: null, additionalPdfs: [],
  };
  const prisma = {
    counterparty: { findFirst: vi.fn().mockResolvedValue({ id: 'partner' }) },
    fileAsset: { findFirst: vi.fn().mockResolvedValue({ mimeType: 'application/pdf', size: 1024 }) },
    contract: {
      findFirst: vi.fn().mockResolvedValue(row),
      create: vi.fn().mockResolvedValue(row), update: vi.fn().mockResolvedValue(row),
    },
  };
  const tx = { ...prisma,
    $executeRaw: vi.fn().mockResolvedValue(1),
    contractNumberCounter: { upsert: vi.fn().mockResolvedValue({ lastNumber: 1 }) },
  };
  const database = { ...prisma, $transaction: vi.fn(async (callback: (tx: unknown) => unknown) => callback(tx)) };
  return { prisma, service: new ContractsService(database as unknown as PrismaService) };
}

const input = { number: 'MANUAL', counterpartyId: 'partner', title: 'Service', defaultAmount: 100 };

describe('contract PDF attachments', () => {
  it('requires the notice PDF and disables billing and renewal on termination', async () => {
    const { prisma, service } = setup();
    await expect(service.update('contract', 'org', { terminationDate: '2026-10-08' })).rejects.toThrow('прикрепите PDF');
    await expect(service.update('contract', 'org', { terminationPdfId: 'notice' })).rejects.toThrow('дату расторжения');
    await service.update('contract', 'org', { terminationDate: '2026-10-08', terminationPdfId: 'notice', active: true, autoRenew: true });
    expect(prisma.contract.update.mock.calls[0]![0].data).toMatchObject({
      terminationDate: new Date('2026-10-08'), terminationPdf: { connect: { id: 'notice' } }, active: false, autoRenew: false,
    });
    expect(prisma.fileAsset.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'notice', organizationId: 'org' } }));
  });
  it('attaches multiple additional PDFs and checks organization for each', async () => {
    const { prisma, service } = setup();
    await service.create('org', { ...input, additionalPdfIds: ['extra1', 'extra2'] });
    expect(prisma.fileAsset.findFirst.mock.calls.map(([query]) => query.where)).toEqual([
      { id: 'extra1', organizationId: 'org' }, { id: 'extra2', organizationId: 'org' },
    ]);
    expect(prisma.contract.create.mock.calls[0]![0].data.additionalPdfs).toEqual({ connect: [{ id: 'extra1' }, { id: 'extra2' }] });
  });

  it('removes selected additional PDFs and can clear the list', async () => {
    const { prisma, service } = setup();
    await service.update('contract', 'org', { additionalPdfIds: ['retained'] });
    expect(prisma.contract.update.mock.calls[0]![0].data.additionalPdfs).toEqual({ set: [{ id: 'retained' }] });
    await service.update('contract', 'org', { additionalPdfIds: [] });
    expect(prisma.contract.update.mock.calls[1]![0].data.additionalPdfs).toEqual({ set: [] });
  });

  it('rejects foreign and non-PDF additional attachments', async () => {
    const { prisma, service } = setup();
    prisma.fileAsset.findFirst.mockResolvedValue(null as never);
    await expect(service.create('org', { ...input, additionalPdfIds: ['foreign'] })).rejects.toThrow('Файл не найден');
    prisma.fileAsset.findFirst.mockResolvedValue({ mimeType: 'image/png', size: 1024 });
    await expect(service.update('contract', 'org', { additionalPdfIds: ['image'] })).rejects.toThrow('формате PDF');
    expect(prisma.contract.create).not.toHaveBeenCalled();
    expect(prisma.contract.update).not.toHaveBeenCalled();
  });

  it('saves both slots and returns file metadata', async () => {
    const { prisma, service } = setup();
    const result = await service.create('org', { ...input, contractPdfId: 'pdf', ndaPdfId: 'nda' });
    expect(prisma.fileAsset.findFirst.mock.calls.map(([query]) => query.where)).toEqual([
      { id: 'pdf', organizationId: 'org' }, { id: 'nda', organizationId: 'org' },
    ]);
    expect(prisma.contract.create.mock.calls[0]![0].data).toMatchObject({ contractPdfId: 'pdf', ndaPdfId: 'nda' });
    expect(result.contractPdf?.originalName).toBe('contract.pdf');
  });

  it.each(['contractPdfId', 'ndaPdfId', 'terminationPdfId'] as const)('rejects foreign/missing %s on creation and update', async (slot) => {
    const { prisma, service } = setup();
    prisma.fileAsset.findFirst.mockResolvedValue(null as never);
    await expect(service.create('org', { ...input, [slot]: 'foreign' })).rejects.toThrow('Файл не найден');
    await expect(service.update('contract', 'org', { [slot]: 'foreign' })).rejects.toThrow('Файл не найден');
    expect(prisma.contract.create).not.toHaveBeenCalled();
    expect(prisma.contract.update).not.toHaveBeenCalled();
  });

  it('rejects non-PDF files', async () => {
    const { prisma, service } = setup();
    prisma.fileAsset.findFirst.mockResolvedValue({ mimeType: 'image/png', size: 1024 });
    await expect(service.update('contract', 'org', { ndaPdfId: 'image' })).rejects.toThrow('формате PDF');
    expect(prisma.contract.update).not.toHaveBeenCalled();
  });

  it.each([0, 100 * 1024 * 1024 + 1])('rejects empty or oversized PDF attachments (%i bytes)', async (size) => {
    const { prisma, service } = setup();
    prisma.fileAsset.findFirst.mockResolvedValue({ mimeType: 'application/pdf', size });
    await expect(service.create('org', { ...input, contractPdfId: 'pdf' })).rejects.toThrow('непустыми PDF размером до 100 МБ');
    await expect(service.update('contract', 'org', { ndaPdfId: 'pdf' })).rejects.toThrow('непустыми PDF размером до 100 МБ');
    await expect(service.update('contract', 'org', { additionalPdfIds: ['pdf'] })).rejects.toThrow('непустыми PDF размером до 100 МБ');
    expect(prisma.contract.create).not.toHaveBeenCalled();
    expect(prisma.contract.update).not.toHaveBeenCalled();
  });

  it.each([20 * 1024 * 1024 + 1, 100 * 1024 * 1024])('accepts larger PDFs in every contract slot (%i bytes)', async (size) => {
    const { prisma, service } = setup();
    prisma.fileAsset.findFirst.mockResolvedValue({ mimeType: 'application/pdf', size });
    await service.create('org', { ...input, contractPdfId: 'pdf', ndaPdfId: 'nda', additionalPdfIds: ['extra'] });
    await service.update('contract', 'org', { contractPdfId: 'pdf', ndaPdfId: 'nda', additionalPdfIds: ['extra'] });
    expect(prisma.contract.create).toHaveBeenCalledOnce();
    expect(prisma.contract.update).toHaveBeenCalledOnce();
  });

  it('replaces a PDF and explicitly disconnects NDA', async () => {
    const { prisma, service } = setup();
    await service.update('contract', 'org', { contractPdfId: 'new', ndaPdfId: null });
    expect(prisma.contract.update.mock.calls[0]![0].data).toMatchObject({
      contractPdf: { connect: { id: 'new' } }, ndaPdf: { disconnect: true },
    });
  });

  it('preserves both attachments when only business fields change', async () => {
    const { prisma, service } = setup();
    await service.update('contract', 'org', { title: 'Updated' });
    const data = prisma.contract.update.mock.calls[0]![0].data;
    expect(data).not.toHaveProperty('contractPdf');
    expect(data).not.toHaveProperty('ndaPdf');
    expect(data).not.toHaveProperty('additionalPdfs');
    expect(prisma.fileAsset.findFirst).not.toHaveBeenCalled();
  });
});
