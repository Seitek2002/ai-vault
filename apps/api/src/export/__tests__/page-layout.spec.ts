import { describe, expect, it, vi } from 'vitest';
import { PDFDocument, rgb } from 'pdf-lib';
import { readPageLayout, pageDimensions } from '@ai-vault/doc-placeholders';
import { applyPdfBackground, validatePageLayout } from '../page-layout.util';
import { LetterheadsService } from '../../letterheads/letterheads.service';
import JSZip from 'jszip';
import { pmToDocx } from '../pm-to-docx.util';
import { DocumentsService } from '../../documents/documents.service';

describe('document page settings and private PDF backgrounds', () => {
  it('places the repeating Word background behind text and writes A5 landscape dimensions', async () => {
    const buffer = await pmToDocx({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'ACT' }] }] }, 'Act', readPageLayout({ pageLayout: { paperSize: 'A5', orientation: 'landscape' } }), { data: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII=', 'base64'), width: 210, height: 148 });
    const zip = await JSZip.loadAsync(buffer), xml = await zip.file('word/document.xml')!.async('string'), header = await zip.file('word/header1.xml')!.async('string');
    expect(xml).toContain('w:w="11906"'); expect(xml).toContain('w:h="8391"');
    expect(xml).toContain('w:headerReference'); expect(header).toContain('behindDoc="1"'); expect(header).toContain('relativeFrom="page"');
  });
  it('inherits page options and substitutes company fields when creating an act from a template', async () => {
    const layout = { paperSize: 'A5', orientation: 'landscape' };
    const prisma = {
      documentTemplate: { findFirst: vi.fn().mockResolvedValue({ type: 'AVR', metaDefaults: { pageLayout: layout }, bodyJson: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: '{{company.name}} / {{org.name}}' }] }] } }) },
      companySettings: { findUnique: vi.fn().mockResolvedValue({ name: 'Provider' }) }, counterparty: { findFirst: vi.fn().mockResolvedValue({ name: 'Customer' }) },
      document: { create: vi.fn().mockResolvedValue({ id: 'doc' }) }, documentVersion: { create: vi.fn() },
    };
    await new DocumentsService(prisma as never, {} as never, {} as never).create('org', 'user', { type: 'AVR', title: 'Act', templateId: 'tpl', counterpartyId: 'cp' } as never);
    const created = prisma.document.create.mock.calls[0]![0] as { data: { meta: unknown; bodyJson: unknown } };
    expect(created.data.meta).toEqual({ pageLayout: layout }); expect(JSON.stringify(created.data.bodyJson)).toContain('Customer / Provider');
    expect(prisma.documentTemplate.findFirst).toHaveBeenCalledWith({ where: { id: 'tpl', organizationId: 'org' } });
  });
  it.each([
    ['A4', 'portrait', 210, 297], ['A4', 'landscape', 297, 210],
    ['A5', 'portrait', 148, 210], ['A5', 'landscape', 210, 148],
  ] as const)('resolves %s %s dimensions', (paperSize, orientation, width, height) => {
    expect(pageDimensions(readPageLayout({ pageLayout: { paperSize, orientation } }))).toEqual({ width, height });
  });
  it('refuses another organization background before reading it', async () => {
    const prisma = { letterhead: { findFirst: vi.fn().mockResolvedValue(null) } };
    await expect(validatePageLayout(prisma as never, 'org-a', { pageLayout: { backgroundId: 'foreign' } })).rejects.toThrow('Бланк организации не найден');
    expect(prisma.letterhead.findFirst).toHaveBeenCalledWith({ where: { id: 'foreign', organizationId: 'org-a' } });
  });
  it('rejects invalid sizes and margins instead of silently changing them', async () => {
    for (const pageLayout of [{ paperSize: 'A0' }, { orientation: 'vertical' }, { margins: { top: -1 } }, { paperSize: 'A5', margins: { top: 100, bottom: 100 } }]) {
      await expect(validatePageLayout({} as never, 'org', { pageLayout })).rejects.toThrow();
    }
  });
  it('preserves content page sizes and count while selecting the requested background page', async () => {
    const content = await PDFDocument.create(); content.addPage([420, 595]).drawText('CONTENT 1'); content.addPage([420, 595]).drawText('CONTENT 2');
    const bg = await PDFDocument.create(); bg.addPage([612, 792]).drawText('WRONG PAGE'); bg.addPage([612, 792]).drawRectangle({ x: 10, y: 10, width: 50, height: 50, color: rgb(0, 0, 1) });
    const rendered = await PDFDocument.load(await applyPdfBackground(await content.save(), await bg.save(), 2));
    expect(rendered.getPageCount()).toBe(2);
    expect(rendered.getPages().map(p => p.getSize())).toEqual([{ width: 420, height: 595 }, { width: 420, height: 595 }]);
    await expect(applyPdfBackground(await content.save(), await bg.save(), 3)).rejects.toThrow('В бланке нет выбранной страницы');
  });
  it('validates the uploaded background file ownership and PDF before saving', async () => {
    const prisma = { fileAsset: { findFirst: vi.fn().mockResolvedValue(null) }, letterhead: { create: vi.fn() } };
    const storage = { download: vi.fn() };
    const service = new LetterheadsService(prisma as never, storage as never);
    await expect(service.create('org-a', { name: 'Blank', bodyJson: { kind: 'pdf-background', fileId: 'foreign' } })).rejects.toThrow('PDF бланка организации не найден');
    expect(storage.download).not.toHaveBeenCalled(); expect(prisma.letterhead.create).not.toHaveBeenCalled();
    prisma.fileAsset.findFirst.mockResolvedValue({ id: 'mine', size: 100, s3Key: 'private' } as never);
    storage.download.mockResolvedValue(Buffer.from('not pdf') as never);
    await expect(service.create('org-a', { name: 'Blank', bodyJson: { kind: 'pdf-background', fileId: 'mine' } })).rejects.toThrow('PDF бланка повреждён');
  });
});
