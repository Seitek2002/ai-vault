import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateLetterheadDto, UpdateLetterheadDto, ListLetterheadsDto } from './dto/letterhead.dto';

@Injectable()
export class LetterheadsService {
  constructor(private prisma: PrismaService) {}

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

  create(organizationId: string, dto: CreateLetterheadDto) {
    return this.prisma.letterhead.create({
      data: {
        organizationId,
        name: dto.name,
        bodyJson: (dto.bodyJson ?? {}) as Prisma.InputJsonValue,
      },
    });
  }

  async update(id: string, organizationId: string, dto: UpdateLetterheadDto) {
    await this.findOne(id, organizationId);
    const data: Prisma.LetterheadUpdateInput = {};
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.bodyJson !== undefined) data.bodyJson = dto.bodyJson as Prisma.InputJsonValue;
    return this.prisma.letterhead.update({ where: { id }, data });
  }

  async remove(id: string, organizationId: string) {
    await this.findOne(id, organizationId);
    return this.prisma.letterhead.delete({ where: { id } });
  }
}
