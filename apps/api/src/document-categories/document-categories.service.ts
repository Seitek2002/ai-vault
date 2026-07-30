import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateDocumentCategoryDto, UpdateDocumentCategoryDto } from './dto/document-category.dto';

@Injectable()
export class DocumentCategoriesService {
  constructor(private prisma: PrismaService) {}

  findAll(organizationId: string) {
    return this.prisma.documentCategory.findMany({
      where: { organizationId },
      orderBy: { name: 'asc' },
    });
  }

  async findOne(id: string, organizationId: string) {
    const category = await this.prisma.documentCategory.findFirst({ where: { id, organizationId } });
    if (!category) throw new NotFoundException('Category not found');
    return category;
  }

  create(organizationId: string, dto: CreateDocumentCategoryDto) {
    return this.prisma.documentCategory.create({
      data: { organizationId, name: dto.name, shortLabel: dto.shortLabel, color: dto.color },
    });
  }

  async update(id: string, organizationId: string, dto: UpdateDocumentCategoryDto) {
    await this.findOne(id, organizationId);
    return this.prisma.documentCategory.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.shortLabel !== undefined ? { shortLabel: dto.shortLabel } : {}),
        ...(dto.color !== undefined ? { color: dto.color } : {}),
      },
    });
  }

  async remove(id: string, organizationId: string) {
    await this.findOne(id, organizationId);
    return this.prisma.documentCategory.delete({ where: { id } });
  }
}
