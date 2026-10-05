import 'reflect-metadata';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { DocumentType } from '@prisma/client';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { describe, expect, it, vi } from 'vitest';
import { DocumentsService } from '../documents.service';
import { ImportDocumentDto } from '../dto/import.dto';

function fixture() {
  const asset = {
    id: 'file-1', organizationId: 'org-1', originalName: 'Подписанный договор.pdf',
    mimeType: 'application/pdf', size: 1024, documentId: null as string | null,
  };
  const doc = {
    id: 'archive-1', organizationId: 'org-1', isArchived: true,
    counterpartyId: 'company-1', type: DocumentType.CUSTOM, categoryId: null,
  };
  const tx = {
    $executeRaw: vi.fn().mockResolvedValue(0),
    counterparty: { findFirst: vi.fn().mockResolvedValue({ id: 'company-1' }) },
    documentCategory: { findFirst: vi.fn().mockResolvedValue({ id: 'category-1' }) },
    fileAsset: { findFirst: vi.fn(async () => ({ ...asset })) },
    document: {
      findFirst: vi.fn(async ({ where }: { where: Record<string, unknown> }) =>
        Object.entries(where).every(([key, value]) => doc[key as keyof typeof doc] === value) ? doc : null),
      create: vi.fn(async () => { asset.documentId = doc.id; return doc; }),
    },
    documentVersion: { create: vi.fn().mockResolvedValue({}) },
  };
  const prisma = { $transaction: vi.fn(async (fn: (client: typeof tx) => unknown) => fn(tx)) };
  const service = new DocumentsService(prisma as never, {} as never, {} as never);
  const dto: ImportDocumentDto = { fileId: 'file-1', counterpartyId: 'company-1', type: DocumentType.CUSTOM };
  const run = (override: Partial<ImportDocumentDto> = {}) => service.importFromFile('org-1', 'user-1', { ...dto, ...override });
  return { service, prisma, tx, asset, doc, dto, run };
}

describe('Archive import', () => {
  it('atomically creates an archived PDF and its initial version', async () => {
    const { tx, prisma, run } = fixture();
    await expect(run()).resolves.toMatchObject({ id: 'archive-1', isArchived: true });
    expect(prisma.$transaction).toHaveBeenCalledOnce();
    expect(tx.$executeRaw.mock.calls[0]?.[1]).toBe('archive:org-1:file-1');
    expect(tx.document.create).toHaveBeenCalledWith({ data: expect.objectContaining({
      organizationId: 'org-1', title: 'Подписанный договор', counterpartyId: 'company-1',
      isArchived: true, fileAssets: { connect: { id: 'file-1' } },
    }) });
    expect(tx.documentVersion.create).toHaveBeenCalledWith({ data: expect.objectContaining({
      documentId: 'archive-1', version: 1, createdById: 'user-1',
    }) });
  });

  it('returns the same archive entry on retry without creating duplicates', async () => {
    const { tx, run } = fixture();
    const first = await run();
    const retry = await run();
    expect(retry).toEqual(first);
    expect(tx.document.create).toHaveBeenCalledOnce();
    expect(tx.documentVersion.create).toHaveBeenCalledOnce();
  });

  it('propagates version errors from inside the transaction', async () => {
    const { tx, run } = fixture();
    tx.documentVersion.create.mockRejectedValue(new Error('version failure'));
    await expect(run()).rejects.toThrow('version failure');
  });

  it.each(['application/msword', 'image/png', 'text/plain'])('rejects %s', async (mimeType) => {
    const { asset, tx, run } = fixture();
    asset.mimeType = mimeType;
    await expect(run()).rejects.toBeInstanceOf(BadRequestException);
    expect(tx.document.create).not.toHaveBeenCalled();
  });

  it.each([0, -1, 20 * 1024 * 1024 + 1])('rejects invalid size %s', async (size) => {
    const { asset, tx, run } = fixture();
    asset.size = size;
    await expect(run()).rejects.toBeInstanceOf(BadRequestException);
    expect(tx.document.create).not.toHaveBeenCalled();
  });

  it('accepts a PDF at the 20 MB limit', async () => {
    const { asset, run } = fixture();
    asset.size = 20 * 1024 * 1024;
    await expect(run()).resolves.toMatchObject({ id: 'archive-1' });
  });

  it.each(['counterparty', 'fileAsset', 'documentCategory'] as const)('scopes %s to the current organization', async (model) => {
    const { tx, run } = fixture();
    tx[model].findFirst.mockResolvedValue(null as never);
    await expect(run({ categoryId: 'category-1' })).rejects.toBeInstanceOf(NotFoundException);
    expect(tx[model].findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: model === 'counterparty' ? 'company-1' : model === 'fileAsset' ? 'file-1' : 'category-1', organizationId: 'org-1' },
    }));
    expect(tx.document.create).not.toHaveBeenCalled();
  });

  it.each([
    { isArchived: false }, { counterpartyId: 'other-company' },
    { organizationId: 'other-org' }, { type: DocumentType.CONTRACT }, { categoryId: 'other-category' },
  ])('does not move a previously attached original: %j', async (override) => {
    const { asset, doc, tx, run } = fixture();
    asset.documentId = doc.id;
    Object.assign(doc, override);
    await expect(run()).rejects.toThrow('Файл уже прикреплён к другому документу');
    expect(tx.document.create).not.toHaveBeenCalled();
  });

  it('gives unnamed PDFs a usable title', async () => {
    const { asset, tx, run } = fixture();
    asset.originalName = '.pdf';
    await run();
    expect(tx.document.create).toHaveBeenCalledWith({ data: expect.objectContaining({ title: 'Документ PDF' }) });
  });
});

describe('Archive import request validation', () => {
  it.each(['fileId', 'counterpartyId', 'categoryId'])('rejects blank %s', async (key) => {
    const dto = plainToInstance(ImportDocumentDto, {
      fileId: 'file-1', counterpartyId: 'company-1', type: DocumentType.CUSTOM, [key]: '  ',
    });
    expect((await validate(dto)).map((error) => error.property)).toContain(key);
  });

  it('trims identifiers and accepts an omitted category', async () => {
    const dto = plainToInstance(ImportDocumentDto, { fileId: ' file-1 ', counterpartyId: ' company-1 ', type: DocumentType.CUSTOM });
    expect(await validate(dto)).toHaveLength(0);
    expect(dto.fileId).toBe('file-1');
    expect(dto.counterpartyId).toBe('company-1');
  });
});
