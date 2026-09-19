import { Injectable, BadRequestException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import type { CompanySettings } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { isSecretBoxConfigured, seal } from '../common/secret-box';
import type { UpdateSettingsDto } from './dto/settings.dto';

const ALLOWED_LOGO_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);

/** Наружу настройки уходят без шифртекста пароля — только флаг «подключён». */
export type PublicSettings = Omit<CompanySettings, 'esfPasswordEnc'> & { esfConfigured: boolean };

function toPublic(row: CompanySettings): PublicSettings {
  const { esfPasswordEnc, ...rest } = row;
  return { ...rest, esfConfigured: !!(row.esfLogin && esfPasswordEnc) };
}

@Injectable()
export class SettingsService {
  constructor(
    private prisma: PrismaService,
    private storage: StorageService,
  ) {}

  async get(organizationId: string): Promise<PublicSettings> {
    return toPublic(await this.ensureRow(organizationId));
  }

  async update(organizationId: string, dto: UpdateSettingsDto): Promise<PublicSettings> {
    const { esfLogin, esfPassword, esfClear, ...rest } = dto;
    const data: Record<string, unknown> = { ...rest };

    if (esfClear) {
      data['esfLogin'] = null;
      data['esfPasswordEnc'] = null;
      data['esfLastSyncAt'] = null;
      data['esfLastSyncError'] = null;
    } else {
      if (esfLogin !== undefined) data['esfLogin'] = esfLogin.trim() || null;
      if (esfPassword !== undefined) {
        if (!isSecretBoxConfigured()) {
          throw new BadRequestException(
            'На сервере не задан ключ шифрования (ESF_SECRET_KEY) — пароль от кабинета сохранить нельзя',
          );
        }
        data['esfPasswordEnc'] = seal(esfPassword);
      }
    }

    await this.ensureRow(organizationId);
    return toPublic(
      await this.prisma.companySettings.update({ where: { organizationId }, data }),
    );
  }

  private ensureRow(organizationId: string) {
    return this.prisma.companySettings.upsert({
      where: { organizationId },
      update: {},
      create: { organizationId, name: '', inn: '', address: '' },
    });
  }

  async uploadLogo(organizationId: string, file: { buffer: Buffer; mimeType: string }) {
    if (!ALLOWED_LOGO_TYPES.has(file.mimeType)) {
      throw new BadRequestException(`Unsupported image type: ${file.mimeType}. Allowed: PNG, JPEG, WEBP.`);
    }
    const ext = file.mimeType.split('/')[1];
    const key = `logos/${organizationId}/${randomUUID()}.${ext}`;
    const url = await this.storage.upload(key, file.buffer, file.mimeType);

    await this.ensureRow(organizationId);
    return toPublic(
      await this.prisma.companySettings.update({
        where: { organizationId },
        data: { logoUrl: url },
      }),
    );
  }
}
