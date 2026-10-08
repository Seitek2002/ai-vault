import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { readPageLayout, pageDimensions, substitutePlaceholders } from '@ai-vault/doc-placeholders';
import { PDFDocument } from 'pdf-lib';
import { pdfBackgroundImage } from './pdf-background-image.util';
import { applyPdfBackground, validatePageLayout } from './page-layout.util';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { pmToHtml } from './pm-to-html.util';
import { pmToDocx } from './pm-to-docx.util';

@Injectable()
export class ExportService {
  private readonly logger = new Logger(ExportService.name);

  constructor(
    private prisma: PrismaService,
    private storage: StorageService,
    private config: ConfigService,
  ) {}

  private async getDoc(documentId: string, organizationId: string) {
    const doc = await this.prisma.document.findFirst({
      where: { id: documentId, organizationId },
    });
    if (!doc) throw new NotFoundException('Document not found');
    return doc;
  }

  // ── PDF ──────────────────────────────────────────────────────────────────

  async generatePdf(documentId: string, organizationId: string): Promise<{ buffer: Buffer; filename: string }> {
    const doc = await this.getDoc(documentId, organizationId);
    return this.renderPdf(doc.bodyJson, doc.title, doc.meta, organizationId);
  }

  async generateTemplatePdf(templateId: string, organizationId: string) {
    const template = await this.prisma.documentTemplate.findFirst({ where: { id: templateId, organizationId } });
    if (!template) throw new NotFoundException('Шаблон не найден');
    return this.generateDraftTemplatePdf(template, organizationId);
  }

  async generateDraftTemplatePdf(template: { bodyJson: unknown; name?: string; metaDefaults?: unknown }, organizationId: string) {
    const settings = await this.prisma.companySettings.findUnique({ where: { organizationId } });
    const body = substitutePlaceholders(template.bodyJson, { org: settings, currency: 'сом' });
    return this.renderPdf(body, template.name || 'Предпросмотр шаблона', template.metaDefaults, organizationId);
  }

  async renderPdf(body: unknown, title: string, meta: unknown, organizationId: string): Promise<{ buffer: Buffer; filename: string }> {
    await validatePageLayout(this.prisma, organizationId, meta);
    const layout = readPageLayout(meta);
    let background: Buffer | undefined;
    if (layout.backgroundId) {
      const bg = await this.prisma.letterhead.findFirst({ where: { id: layout.backgroundId, organizationId } });
      const fileId = (bg?.bodyJson as { fileId?: string } | undefined)?.fileId;
      const asset = await this.prisma.fileAsset.findFirst({ where: { id: fileId ?? '', organizationId, mimeType: 'application/pdf' } });
      if (!asset) throw new NotFoundException('PDF бланка не найден. Выберите другой бланк.');
      background = await this.storage.download(asset.s3Key);
    }
    const html = pmToHtml(body, title).replace('</style>', 'body { background: transparent; } table.borderless td:first-child { white-space: normal; } tr { break-inside: avoid; } p:has(> strong:only-child) { break-after: avoid; } </style>');

    // Dynamic import so the app starts even without puppeteer-core configured
    const puppeteer = await import('puppeteer-core');

    const chromePath =
      this.config.get<string>('CHROME_PATH') ??
      (process.platform === 'win32'
        ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
        : process.platform === 'darwin'
        ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
        : '/usr/bin/google-chrome-stable');

    const browser = await puppeteer.default.launch({
      executablePath: chromePath,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
      headless: true,
      // Cold Chromium startup on the production host can exceed Puppeteer's 30 s default.
      timeout: 90000,
      protocolTimeout: 90000,
      pipe: true,
    });

    try {
      const page = await browser.newPage();
      await page.setContent(html, { waitUntil: 'load', timeout: 60000 });
      const pdf = await page.pdf({
        format: layout.paperSize,
        landscape: layout.orientation === 'landscape',
        margin: Object.fromEntries(Object.entries(layout.margins).map(([key, value]) => [key, `${value}mm`])),
        omitBackground: true,
        printBackground: true,
        timeout: 60000,
      });
      return { buffer: background ? await applyPdfBackground(pdf, background, layout.backgroundPage) : Buffer.from(pdf), filename: title };
    } finally {
      await browser.close();
    }
  }

  // ── DOCX ─────────────────────────────────────────────────────────────────

  async generateDocx(documentId: string, organizationId: string): Promise<{ buffer: Buffer; filename: string }> {
    const doc = await this.getDoc(documentId, organizationId);
    await validatePageLayout(this.prisma, organizationId, doc.meta);
    const layout = readPageLayout(doc.meta);
    let background: { data: Buffer; width: number; height: number } | undefined;
    if (layout.backgroundId) {
      const bg = await this.prisma.letterhead.findFirst({ where: { id: layout.backgroundId, organizationId } });
      const fileId = (bg?.bodyJson as { fileId?: string } | undefined)?.fileId;
      const asset = await this.prisma.fileAsset.findFirst({ where: { id: fileId ?? '', organizationId, mimeType: 'application/pdf' } });
      if (!asset) throw new NotFoundException('PDF бланка не найден');
      const bytes = await this.storage.download(asset.s3Key), pdf = await PDFDocument.load(bytes);
      const bgPage = pdf.getPage(layout.backgroundPage - 1).getSize(), page = pageDimensions(layout);
      const scale = Math.min(page.width / bgPage.width, page.height / bgPage.height);
      background = { data: await pdfBackgroundImage(bytes, layout.backgroundPage), width: bgPage.width * scale, height: bgPage.height * scale };
    }
    const buffer = await pmToDocx(doc.bodyJson, doc.title, layout, background);
    return { buffer, filename: doc.title };
  }

  // ── Original file ─────────────────────────────────────────────────────────

  private async getOriginalAsset(documentId: string, organizationId: string) {
    const doc = await this.getDoc(documentId, organizationId);

    const asset = await this.prisma.fileAsset.findFirst({
      where: { documentId: doc.id, organizationId },
      orderBy: { createdAt: 'desc' },
    });
    if (!asset) throw new NotFoundException('Оригинал документа не найден');
    return asset;
  }

  async getOriginalFileUrl(documentId: string, organizationId: string): Promise<string> {
    const asset = await this.getOriginalAsset(documentId, organizationId);
    return this.storage.presignedUrl(asset.s3Key, 3600);
  }

  async getOriginalFile(documentId: string, organizationId: string) {
    const asset = await this.getOriginalAsset(documentId, organizationId);
    return {
      buffer: await this.storage.download(asset.s3Key),
      filename: asset.originalName,
      mimeType: asset.mimeType,
    };
  }
}
