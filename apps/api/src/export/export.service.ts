import { Injectable, NotFoundException, Logger } from '@nestjs/common';
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
    const html = pmToHtml(doc.bodyJson, doc.title);

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
    });

    try {
      const page = await browser.newPage();
      await page.setContent(html, { waitUntil: 'load' });
      const pdf = await page.pdf({
        format: 'A4',
        margin: { top: '1.5cm', right: '1.5cm', bottom: '1.5cm', left: '1.5cm' },
        printBackground: true,
      });
      return { buffer: Buffer.from(pdf), filename: doc.title };
    } finally {
      await browser.close();
    }
  }

  // ── DOCX ─────────────────────────────────────────────────────────────────

  async generateDocx(documentId: string, organizationId: string): Promise<{ buffer: Buffer; filename: string }> {
    const doc = await this.getDoc(documentId, organizationId);
    const buffer = await pmToDocx(doc.bodyJson, doc.title);
    return { buffer, filename: doc.title };
  }

  // ── Original file ─────────────────────────────────────────────────────────

  async getOriginalFileUrl(documentId: string, organizationId: string): Promise<string> {
    const doc = await this.getDoc(documentId, organizationId);

    const asset = await this.prisma.fileAsset.findFirst({
      where: { documentId: doc.id, organizationId },
      orderBy: { createdAt: 'desc' },
    });
    if (!asset) throw new NotFoundException('No original file for this document');

    return this.storage.presignedUrl(asset.s3Key, 3600);
  }
}
