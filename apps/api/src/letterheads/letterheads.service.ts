import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PDFDocument } from 'pdf-lib';
import { StorageService } from '../storage/storage.service';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateLetterheadDto, UpdateLetterheadDto, ListLetterheadsDto } from './dto/letterhead.dto';

@Injectable()
export class LetterheadsService {
  constructor(private prisma: PrismaService, private storage: StorageService) {}

  private async validateBackground(organizationId: string, body: unknown) {
    const data = body as { kind?: string; fileId?: string } | null;
    if (data?.kind !== 'pdf-background') return body;
    if (!data.fileId || typeof data.fileId !== 'string') throw new BadRequestException('Выберите PDF бланка');
    const asset = await this.prisma.fileAsset.findFirst({ where: { id: data.fileId, organizationId, mimeType: 'application/pdf' } });
    if (!asset) throw new NotFoundException('PDF бланка организации не найден');
    if (asset.size <= 0 || asset.size > 100 * 1024 * 1024) throw new BadRequestException('PDF бланка должен быть не больше 100 МБ');
    let pdf: PDFDocument;
    try { pdf = await PDFDocument.load(await this.storage.download(asset.s3Key)); }
    catch { throw new BadRequestException('PDF бланка повреждён или защищён паролем'); }
    if (!pdf.getPageCount()) throw new BadRequestException('В бланке нет страниц');
    return { kind: 'pdf-background', fileId: asset.id, pageCount: pdf.getPageCount() };
  }

  findAll(organizationId: string, query: ListLetterheadsDto) {
    return this.prisma.letterhead.findMany({
      where: {
        organizationId,
        ...(query.search ? { name: { contains: query.search, mode: 'insensitive' } } : {}),
      },
      orderBy: { name: 'asc' },
    });
  }

  async findOne(id: string, organizationId: string) {
    const letterhead = await this.prisma.letterhead.findFirst({ where: { id, organizationId } });
    if (!letterhead) throw new NotFoundException('Letterhead not found');
    return letterhead;
  }

  async create(organizationId: string, dto: CreateLetterheadDto) {
    const bodyJson = await this.validateBackground(organizationId, dto.bodyJson);
    return this.prisma.letterhead.create({
      data: {
        organizationId,
        name: dto.name,
        bodyJson: (bodyJson ?? {}) as Prisma.InputJsonValue,
      },
    });
  }

  async update(id: string, organizationId: string, dto: UpdateLetterheadDto) {
    await this.findOne(id, organizationId);
    const data: Prisma.LetterheadUpdateInput = {};
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.bodyJson !== undefined) data.bodyJson = await this.validateBackground(organizationId, dto.bodyJson) as Prisma.InputJsonValue;
    return this.prisma.letterhead.update({ where: { id }, data });
  }

  async remove(id: string, organizationId: string) {
    await this.findOne(id, organizationId);
    return this.prisma.letterhead.delete({ where: { id } });
  }
}
