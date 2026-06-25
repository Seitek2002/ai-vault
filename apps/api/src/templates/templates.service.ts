import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateTemplateDto, UpdateTemplateDto, ListTemplatesDto } from './dto/template.dto';

@Injectable()
export class TemplatesService {
  constructor(private prisma: PrismaService) {}

  findAll(organizationId: string, query: ListTemplatesDto) {
    return this.prisma.documentTemplate.findMany({
      where: {
        organizationId,
        ...(query.type ? { type: query.type } : {}),
      },
      orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],
    });
  }

  async findOne(id: string, organizationId: string) {
    const tpl = await this.prisma.documentTemplate.findFirst({
      where: { id, organizationId },
    });
    if (!tpl) throw new NotFoundException('Template not found');
    return tpl;
  }

  create(organizationId: string, dto: CreateTemplateDto) {
    return this.prisma.documentTemplate.create({
      data: {
        organizationId,
        type: dto.type,
        name: dto.name,
        ...(dto.description !== undefined ? { description: dto.description } : {}),
        bodyJson: (dto.bodyJson ?? {}) as Prisma.InputJsonValue,
        metaDefaults: (dto.metaDefaults ?? {}) as Prisma.InputJsonValue,
        ...(dto.isDefault !== undefined ? { isDefault: dto.isDefault } : {}),
      },
    });
  }

  async update(id: string, organizationId: string, dto: UpdateTemplateDto) {
    await this.findOne(id, organizationId);
    const data: Prisma.DocumentTemplateUpdateInput = {};
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.description !== undefined) data.description = dto.description;
    if (dto.bodyJson !== undefined) data.bodyJson = dto.bodyJson as Prisma.InputJsonValue;
    if (dto.metaDefaults !== undefined) data.metaDefaults = dto.metaDefaults as Prisma.InputJsonValue;
    if (dto.isDefault !== undefined) data.isDefault = dto.isDefault;
    return this.prisma.documentTemplate.update({ where: { id }, data });
  }

  async remove(id: string, organizationId: string) {
    await this.findOne(id, organizationId);
    return this.prisma.documentTemplate.delete({ where: { id } });
  }
}
