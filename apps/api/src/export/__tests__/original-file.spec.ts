import { NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { ExportService } from '../export.service';
import { ExportController } from '../export.controller';

function fixture() {
  const asset = { s3Key: 'org-1/contract.pdf', originalName: 'Договор № 1.pdf', mimeType: 'application/pdf' };
  const prisma = {
    document: { findFirst: vi.fn().mockResolvedValue({ id: 'doc-1' }) },
    fileAsset: { findFirst: vi.fn().mockResolvedValue(asset) },
  };
  const buffer = Buffer.from('%PDF original content');
  const storage = { download: vi.fn().mockResolvedValue(buffer), presignedUrl: vi.fn().mockResolvedValue('https://files.example.test/contract.pdf') };
  const service = new ExportService(prisma as never, storage as never, {} as never);
  return { service, prisma, storage, asset, buffer };
}

describe('Download archive original', () => {
  it('downloads the original bytes, preserving filename and MIME', async () => {
    const { service, prisma, storage, buffer } = fixture();
    expect(await service.getOriginalFile('doc-1', 'org-1')).toEqual({ buffer, filename: 'Договор № 1.pdf', mimeType: 'application/pdf' });
    expect(storage.download).toHaveBeenCalledWith('org-1/contract.pdf');
    expect(prisma.document.findFirst).toHaveBeenCalledWith({ where: { id: 'doc-1', organizationId: 'org-1' } });
    expect(prisma.fileAsset.findFirst).toHaveBeenCalledWith({ where: { documentId: 'doc-1', organizationId: 'org-1' }, orderBy: { createdAt: 'desc' } });
  });

  it('refuses inaccessible documents before reading storage', async () => {
    const { service, prisma, storage } = fixture();
    prisma.document.findFirst.mockResolvedValue(null);
    await expect(service.getOriginalFile('foreign', 'org-1')).rejects.toBeInstanceOf(NotFoundException);
    expect(storage.download).not.toHaveBeenCalled();
    expect(prisma.fileAsset.findFirst).not.toHaveBeenCalled();
  });

  it('reports missing original files', async () => {
    const { service, prisma, storage } = fixture();
    prisma.fileAsset.findFirst.mockResolvedValue(null);
    await expect(service.getOriginalFile('doc-1', 'org-1')).rejects.toThrow('Оригинал документа не найден');
    expect(storage.download).not.toHaveBeenCalled();
  });

  it('keeps the signed URL endpoint available for external viewing', async () => {
    const { service, storage } = fixture();
    expect(await service.getOriginalFileUrl('doc-1', 'org-1')).toBe('https://files.example.test/contract.pdf');
    expect(storage.presignedUrl).toHaveBeenCalledWith('org-1/contract.pdf', 3600);
  });

  it('serves downloads privately with a correctly encoded Cyrillic filename', async () => {
    const { service, buffer } = fixture();
    const reply = { header: vi.fn().mockReturnThis(), send: vi.fn() };
    await new ExportController(service).downloadOriginal('doc-1', 'org-1', reply as never);
    expect(reply.header).toHaveBeenCalledWith('Content-Type', 'application/pdf');
    expect(reply.header).toHaveBeenCalledWith('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent('Договор № 1.pdf')}`);
    expect(reply.header).toHaveBeenCalledWith('Cache-Control', 'private, no-store');
    expect(reply.send).toHaveBeenCalledWith(buffer);
  });
});
