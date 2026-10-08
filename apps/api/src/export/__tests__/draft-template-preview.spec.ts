import { describe, expect, it, vi } from 'vitest';
import { validate } from 'class-validator';
import { ExportService } from '../export.service';
import { TemplatesController } from '../../templates/templates.controller';
import { PreviewTemplateDto } from '../../templates/dto/template.dto';

const draft = {
  name: 'Unsaved act',
  bodyJson: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: '{{org.name}} / {{company.name}}' }] }] },
  metaDefaults: { pageLayout: { paperSize: 'A5', orientation: 'landscape' } },
};

describe('unsaved template PDF preview', () => {
  it('renders the submitted draft with organization settings without creating a document or allocating a number', async () => {
    const prisma = {
      companySettings: { findUnique: vi.fn().mockResolvedValue({ name: 'My organization' }) },
      documentTemplate: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
      document: { create: vi.fn() }, documentVersion: { create: vi.fn() }, documentCounter: { upsert: vi.fn() },
    };
    const service = new ExportService(prisma as never, {} as never, {} as never);
    const pdf = { buffer: Buffer.from('%PDF preview'), filename: draft.name };
    const render = vi.spyOn(service, 'renderPdf').mockResolvedValue(pdf);
    expect(await service.generateDraftTemplatePdf(draft, 'org-a')).toEqual(pdf);
    expect(prisma.companySettings.findUnique).toHaveBeenCalledWith({ where: { organizationId: 'org-a' } });
    const [body, title, meta, org] = render.mock.calls[0]!;
    expect(JSON.stringify(body)).toContain('My organization');
    expect(JSON.stringify(body)).not.toContain('{{company.name}}');
    expect([title, meta, org]).toEqual([draft.name, draft.metaDefaults, 'org-a']);
    expect(prisma.documentTemplate.findFirst).not.toHaveBeenCalled();
    expect(prisma.documentTemplate.create).not.toHaveBeenCalled();
    expect(prisma.documentTemplate.update).not.toHaveBeenCalled();
    expect(prisma.document.create).not.toHaveBeenCalled();
    expect(prisma.documentVersion.create).not.toHaveBeenCalled();
    expect(prisma.documentCounter.upsert).not.toHaveBeenCalled();
  });

  it('refuses a foreign background before storage access or PDF rendering', async () => {
    const prisma = {
      companySettings: { findUnique: vi.fn().mockResolvedValue({}) },
      letterhead: { findFirst: vi.fn().mockResolvedValue(null) },
      fileAsset: { findFirst: vi.fn() },
    };
    const storage = { download: vi.fn() };
    const service = new ExportService(prisma as never, storage as never, {} as never);
    await expect(service.generateDraftTemplatePdf({ ...draft, metaDefaults: { pageLayout: { backgroundId: 'foreign' } } }, 'org-a')).rejects.toThrow('Бланк организации не найден');
    expect(prisma.letterhead.findFirst).toHaveBeenCalledWith({ where: { id: 'foreign', organizationId: 'org-a' } });
    expect(storage.download).not.toHaveBeenCalled();
    expect(prisma.fileAsset.findFirst).not.toHaveBeenCalled();
  });

  it('serves PDF bytes with private cache headers', async () => {
    const buffer = Buffer.from('%PDF preview');
    const exporter = { generateDraftTemplatePdf: vi.fn().mockResolvedValue({ buffer }) };
    const reply = { header: vi.fn().mockReturnThis(), send: vi.fn() };
    await new TemplatesController({} as never, exporter as never).previewDraft(draft, 'org-a', reply as never);
    expect(exporter.generateDraftTemplatePdf).toHaveBeenCalledWith(draft, 'org-a');
    expect(reply.header).toHaveBeenCalledWith('Content-Type', 'application/pdf');
    expect(reply.header).toHaveBeenCalledWith('Cache-Control', 'private, no-store');
    expect(reply.send).toHaveBeenCalledWith(buffer);
  });

  it('validates required document content and optional page metadata', async () => {
    expect(await validate(Object.assign(new PreviewTemplateDto(), draft))).toEqual([]);
    for (const data of [{}, { bodyJson: 'text' }, { bodyJson: [] }, { bodyJson: draft.bodyJson, metaDefaults: 'invalid' }, { ...draft, name: 'x'.repeat(201) }]) {
      expect((await validate(Object.assign(new PreviewTemplateDto(), data))).length).toBeGreaterThan(0);
    }
  });
});
