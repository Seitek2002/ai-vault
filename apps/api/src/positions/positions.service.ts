import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { CreatePositionDto, UpdatePositionDto } from './dto/position.dto';

@Injectable()
export class PositionsService {
  constructor(private prisma: PrismaService) {}

  findAll(organizationId: string) {
    return this.prisma.position.findMany({
      where: { organizationId },
      orderBy: { name: 'asc' },
    });
  }

  async findOne(id: string, organizationId: string) {
    const position = await this.prisma.position.findFirst({ where: { id, organizationId } });
    if (!position) throw new NotFoundException('Position not found');
    return position;
  }

  create(organizationId: string, dto: CreatePositionDto) {
    return this.prisma.position.create({
      data: { organizationId, name: dto.name, permissions: dto.permissions },
    });
  }

  async update(id: string, organizationId: string, dto: UpdatePositionDto) {
    await this.findOne(id, organizationId);
    return this.prisma.position.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.permissions !== undefined ? { permissions: dto.permissions } : {}),
      },
    });
  }

  async remove(id: string, organizationId: string) {
    await this.findOne(id, organizationId);
    return this.prisma.position.delete({ where: { id } });
  }
}
