import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { UpdateSettingsDto } from './dto/settings.dto';

@Injectable()
export class SettingsService {
  constructor(private prisma: PrismaService) {}

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
}
