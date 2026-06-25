import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { parsePdf } from './parsers/pdf.parser';
import { parseDocx, parseDocxToPm, type PmNode } from './parsers/docx.parser';
import { randomUUID } from 'crypto';

export interface UploadedFile {
  buffer: Buffer;
  originalName: string;
  mimeType: string;
}

const ALLOWED_TYPES = new Set([
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/msword',
  'text/plain',
]);

const MIME_EXT: Record<string, string> = {
  'application/pdf': 'pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/msword': 'doc',
  'text/plain': 'txt',
};

@Injectable()
export class FilesService {
  constructor(
    private prisma: PrismaService,
    private storage: StorageService,
  ) {}

  async upload(
    organizationId: string,
    userId: string,
    file: UploadedFile,
    documentId?: string,
  ) {
    if (!ALLOWED_TYPES.has(file.mimeType)) {
      throw new BadRequestException(
        `Unsupported file type: ${file.mimeType}. Allowed: PDF, DOCX, TXT.`,
      );
    }

    const ext = MIME_EXT[file.mimeType] ?? 'bin';
    const s3Key = `${organizationId}/${randomUUID()}.${ext}`;
    const s3Url = await this.storage.upload(s3Key, file.buffer, file.mimeType);

    return this.prisma.fileAsset.create({
      data: {
        organizationId,
        ...(documentId ? { documentId } : {}),
        originalName: file.originalName,
        mimeType: file.mimeType,
        size: file.buffer.length,
        s3Key,
        s3Url,
        createdById: userId,
      },
    });
  }

  async extractText(fileAssetId: string, organizationId: string): Promise<string> {
    const asset = await this.prisma.fileAsset.findFirst({
      where: { id: fileAssetId, organizationId },
    });
    if (!asset) throw new NotFoundException('File not found');

    const buffer = await this.storage.download(asset.s3Key);

    switch (asset.mimeType) {
      case 'application/pdf':
        return parsePdf(buffer);
      case 'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
      case 'application/msword':
        return parseDocx(buffer);
      case 'text/plain':
        return buffer.toString('utf-8');
      default:
        throw new BadRequestException(`Cannot parse file type: ${asset.mimeType}`);
    }
  }

  async extractAsPm(fileAssetId: string, organizationId: string): Promise<{ type: 'doc'; content: PmNode[] }> {
    const asset = await this.prisma.fileAsset.findFirst({
      where: { id: fileAssetId, organizationId },
    });
    if (!asset) throw new NotFoundException('File not found');

    const buffer = await this.storage.download(asset.s3Key);

    if (
      asset.mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
      asset.mimeType === 'application/msword'
    ) {
      return parseDocxToPm(buffer);
    }

    let text: string;
    if (asset.mimeType === 'application/pdf') {
      text = await parsePdf(buffer);
    } else {
      text = buffer.toString('utf-8');
    }
    const lines = text.split('\n').filter((l) => l.trim());
    return {
      type: 'doc',
      content: lines.map((line) => ({
        type: 'paragraph',
        content: [{ type: 'text', text: line }],
      })),
    };
  }

  async findOne(id: string, organizationId: string) {
    const asset = await this.prisma.fileAsset.findFirst({
      where: { id, organizationId },
    });
    if (!asset) throw new NotFoundException('File not found');
    return asset;
  }
}
