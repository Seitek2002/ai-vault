import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateCounterpartyDto, UpdateCounterpartyDto } from './dto/counterparty.dto';

@Injectable()
export class CounterpartiesService {
  constructor(private prisma: PrismaService) {}

  findAll(organizationId: string, search?: string) {
    return this.prisma.counterparty.findMany({
      where: {
        organizationId,
        ...(search ? { name: { contains: search, mode: 'insensitive' } } : {}),
      },
      orderBy: { name: 'asc' },
    });
  }

  async findOne(id: string, organizationId: string) {
    const cp = await this.prisma.counterparty.findFirst({
      where: { id, organizationId },
    });
    if (!cp) throw new NotFoundException('Counterparty not found');
    return cp;
  }

  create(organizationId: string, dto: CreateCounterpartyDto) {
    return this.prisma.counterparty.create({
      data: {
        ...dto,
        organizationId,
        inn: dto.inn ?? null,
        bin: dto.bin ?? null,
        address: dto.address ?? null,
        phone: dto.phone ?? null,
        email: dto.email ?? null,
        bankAccount: dto.bankAccount ?? null,
        bankName: dto.bankName ?? null,
        bankBik: dto.bankBik ?? null,
      },
    });
  }

  async update(id: string, organizationId: string, dto: UpdateCounterpartyDto) {
    await this.findOne(id, organizationId);
    return this.prisma.counterparty.update({ where: { id }, data: dto });
  }

  async remove(id: string, organizationId: string) {
    await this.findOne(id, organizationId);
    return this.prisma.counterparty.delete({ where: { id } });
  }
}
