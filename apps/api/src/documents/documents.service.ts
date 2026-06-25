import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { FilesService } from '../files/files.service';
import type { CreateDocumentDto, UpdateDocumentDto, ListDocumentsDto, ReplaceFileDto } from './dto/document.dto';
import type { ImportDocumentDto } from './dto/import.dto';

interface PmNode {
  type: string;
  text?: string;
  content?: PmNode[];
  attrs?: Record<string, unknown>;
  marks?: Array<{ type: string; attrs?: Record<string, unknown> }>;
}

@Injectable()
export class DocumentsService {
  constructor(
    private prisma: PrismaService,
    private files: FilesService,
  ) {}

  async findAll(organizationId: string, query: ListDocumentsDto) {
    const { type, status, counterpartyId, search, page = 1, limit = 20 } = query;
    const skip = (page - 1) * limit;

    const where: Prisma.DocumentWhereInput = {
      organizationId,
      ...(type ? { type } : {}),
      ...(status ? { status } : {}),
      ...(counterpartyId ? { counterpartyId } : {}),
      ...(search ? { title: { contains: search, mode: 'insensitive' } } : {}),
    };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.document.findMany({
        where,
        skip,
        take: limit,
        orderBy: { updatedAt: 'desc' },
        include: {
          counterparty: true,
          createdBy: { select: { id: true, name: true } },
        },
      }),
      this.prisma.document.count({ where }),
    ]);

    return { data, total, page, limit };
  }

  async findOne(id: string, organizationId: string) {
    const doc = await this.prisma.document.findFirst({
      where: { id, organizationId },
      include: {
        counterparty: true,
        createdBy: { select: { id: true, name: true } },
        versions: { orderBy: { version: 'desc' }, take: 1 },
        changes: { where: { status: 'PENDING' }, orderBy: { createdAt: 'asc' } },
        fileAssets: true,
      },
    });
    if (!doc) throw new NotFoundException('Document not found');
    return doc;
  }

  async create(organizationId: string, userId: string, dto: CreateDocumentDto) {
    let bodyJson: Prisma.InputJsonValue = dto.bodyJson
      ? (dto.bodyJson as Prisma.InputJsonValue)
      : {};

    if (!dto.bodyJson && dto.templateId) {
      const template = await this.prisma.documentTemplate.findFirst({
        where: { id: dto.templateId, organizationId },
      });
      if (template) bodyJson = template.bodyJson as Prisma.InputJsonValue;
    }

    const doc = await this.prisma.document.create({
      data: {
        organizationId,
        type: dto.type,
        title: dto.title,
        ...(dto.counterpartyId ? { counterpartyId: dto.counterpartyId } : {}),
        meta: (dto.meta ?? {}) as Prisma.InputJsonValue,
        bodyJson,
        createdById: userId,
      },
    });

    await this.prisma.documentVersion.create({
      data: { documentId: doc.id, version: 1, bodyJson, createdById: userId },
    });

    return doc;
  }

  async update(id: string, organizationId: string, userId: string, dto: UpdateDocumentDto) {
    await this.findOne(id, organizationId);

    if (dto.bodyJson !== undefined) {
      const lastVersion = await this.prisma.documentVersion.findFirst({
        where: { documentId: id },
        orderBy: { version: 'desc' },
      });
      await this.prisma.documentVersion.create({
        data: {
          documentId: id,
          version: (lastVersion?.version ?? 0) + 1,
          bodyJson: dto.bodyJson as Prisma.InputJsonValue,
          createdById: userId,
        },
      });
    }

    const data: Prisma.DocumentUpdateInput = {};
    if (dto.title !== undefined) data.title = dto.title;
    if (dto.status !== undefined) data.status = dto.status;
    if (dto.meta !== undefined) data.meta = dto.meta as Prisma.InputJsonValue;
    if (dto.bodyJson !== undefined) data.bodyJson = dto.bodyJson as Prisma.InputJsonValue;
    if (dto.counterpartyId !== undefined) {
      data.counterparty = dto.counterpartyId
        ? { connect: { id: dto.counterpartyId } }
        : { disconnect: true };
    }

    return this.prisma.document.update({ where: { id }, data });
  }

  async remove(id: string, organizationId: string) {
    await this.findOne(id, organizationId);
    return this.prisma.document.delete({ where: { id } });
  }

  async replaceFile(id: string, organizationId: string, userId: string, dto: ReplaceFileDto) {
    await this.findOne(id, organizationId);
    const bodyJson = await this.files.extractAsPm(dto.fileId, organizationId);

    const lastVersion = await this.prisma.documentVersion.findFirst({
      where: { documentId: id },
      orderBy: { version: 'desc' },
    });
    await this.prisma.documentVersion.create({
      data: {
        documentId: id,
        version: (lastVersion?.version ?? 0) + 1,
        bodyJson: bodyJson as unknown as Prisma.InputJsonValue,
        createdById: userId,
      },
    });

    return this.prisma.document.update({
      where: { id },
      data: {
        bodyJson: bodyJson as unknown as Prisma.InputJsonValue,
        fileAssets: { set: [{ id: dto.fileId }] },
      },
    });
  }

  async importFromFile(organizationId: string, userId: string, dto: ImportDocumentDto) {
    const [bodyJson, fileAsset] = await Promise.all([
      this.files.extractAsPm(dto.fileId, organizationId),
      this.files.findOne(dto.fileId, organizationId),
    ]);

    const title = fileAsset.originalName.replace(/\.[^.]+$/, '');
    const doc = await this.prisma.document.create({
      data: {
        organizationId,
        type: dto.type,
        title,
        meta: {} as Prisma.InputJsonValue,
        bodyJson: bodyJson as unknown as Prisma.InputJsonValue,
        createdById: userId,
        fileAssets: { connect: { id: dto.fileId } },
      },
    });

    await this.prisma.documentVersion.create({
      data: {
        documentId: doc.id,
        version: 1,
        bodyJson: bodyJson as unknown as Prisma.InputJsonValue,
        createdById: userId,
      },
    });

    return doc;
  }

  private rawTextToPm(text: string): { type: 'doc'; content: PmNode[] } {
    const lines = text.split('\n').filter((l) => l.trim());
    return {
      type: 'doc',
      content: lines.map((line) => ({
        type: 'paragraph',
        content: [{ type: 'text', text: line }],
      })),
    };
  }
}
