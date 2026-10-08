import { BadRequestException, NotFoundException } from '@nestjs/common';
import { readPageLayout, pageDimensions } from '@ai-vault/doc-placeholders';
import type { PrismaService } from '../prisma/prisma.service';
import { PDFDocument } from 'pdf-lib';

export async function validatePageLayout(prisma: PrismaService, organizationId: string, meta: unknown) {
  const raw = (meta as { pageLayout?: Record<string, unknown> } | null)?.pageLayout;
  if (raw === undefined) return;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new BadRequestException('Некорректные параметры страницы');
  if (raw.paperSize !== undefined && !['A4', 'A5'].includes(String(raw.paperSize))) throw new BadRequestException('Выберите А4 или А5');
  if (raw.orientation !== undefined && !['portrait', 'landscape'].includes(String(raw.orientation))) throw new BadRequestException('Некорректная ориентация');
  if (raw.backgroundId !== undefined && typeof raw.backgroundId !== 'string') throw new BadRequestException('Некорректный бланк');
  if (raw.backgroundPage !== undefined && (!Number.isInteger(raw.backgroundPage) || Number(raw.backgroundPage) < 1)) throw new BadRequestException('Некорректная страница бланка');
  if (raw.margins !== undefined) {
    if (!raw.margins || typeof raw.margins !== 'object' || Array.isArray(raw.margins)) throw new BadRequestException('Некорректные поля');
    for (const value of Object.values(raw.margins)) if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 100) throw new BadRequestException('Поля должны быть от 0 до 100 мм');
  }
  const layout = readPageLayout(meta), size = pageDimensions(layout);
  if (layout.margins.left + layout.margins.right >= size.width - 20 || layout.margins.top + layout.margins.bottom >= size.height - 20) throw new BadRequestException('Поля оставляют слишком мало места для текста');
  if (layout.backgroundId) {
    const bg = await prisma.letterhead.findFirst({ where: { id: layout.backgroundId, organizationId } });
    const data = bg?.bodyJson as { kind?: string; pageCount?: number } | undefined;
    if (!bg || data?.kind !== 'pdf-background') throw new NotFoundException('Бланк организации не найден');
    if (layout.backgroundPage > Number(data.pageCount ?? 1)) throw new BadRequestException('В бланке нет выбранной страницы');
  }
}

/** Draw only page content, omitting scripts, annotations and form actions from the source. */
export async function applyPdfBackground(content: Uint8Array, background: Uint8Array, pageNumber: number) {
  const source = await PDFDocument.load(content), bg = await PDFDocument.load(background), result = await PDFDocument.create();
  if (!Number.isInteger(pageNumber) || pageNumber < 1 || pageNumber > bg.getPageCount()) throw new BadRequestException('В бланке нет выбранной страницы');
  const [letterhead] = await result.embedPages([bg.getPage(pageNumber - 1)]);
  const textPages = await result.embedPages(source.getPages());
  for (let i = 0; i < source.getPageCount(); i++) {
    const size = source.getPage(i).getSize(), page = result.addPage([size.width, size.height]);
    const scale = Math.min(size.width / letterhead!.width, size.height / letterhead!.height);
    const width = letterhead!.width * scale, height = letterhead!.height * scale;
    page.drawPage(letterhead!, { x: (size.width - width) / 2, y: (size.height - height) / 2, width, height });
    page.drawPage(textPages[i]!, { x: 0, y: 0, width: size.width, height: size.height });
  }
  return Buffer.from(await result.save());
}
