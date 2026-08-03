import { Injectable, BadRequestException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import type { UpdateSettingsDto } from './dto/settings.dto';

const ALLOWED_LOGO_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);

@Injectable()
export class SettingsService {
  constructor(
    private prisma: PrismaService,
    private storage: StorageService,
  ) {}

  async get(organizationId: string) {
    return this.prisma.companySettings.upsert({
      where: { organizationId },
      update: {},
      create: { organizationId, name: '', inn: '', address: '' },
    });
  }

  async update(organizationId: string, dto: UpdateSettingsDto) {
    return this.prisma.companySettings.update({
      where: { organizationId },
      data: dto,
    });
  }

  async uploadLogo(organizationId: string, file: { buffer: Buffer; mimeType: string }) {
    if (!ALLOWED_LOGO_TYPES.has(file.mimeType)) {
      throw new BadRequestException(`Unsupported image type: ${file.mimeType}. Allowed: PNG, JPEG, WEBP.`);
    }
    const ext = file.mimeType.split('/')[1];
    const key = `logos/${organizationId}/${randomUUID()}.${ext}`;
    const url = await this.storage.upload(key, file.buffer, file.mimeType);

    await this.get(organizationId); // ensure the row exists (upsert)
    return this.prisma.companySettings.update({
      where: { organizationId },
      data: { logoUrl: url },
    });
  }
}
