import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateContractDto, ListContractsDto, UpdateContractDto } from './dto/contract.dto';

const CONTRACT_INCLUDE = {
  counterparty: { select: { id: true, name: true, inn: true } },
} satisfies Prisma.ContractInclude;

type ContractWithCounterparty = Prisma.ContractGetPayload<{ include: typeof CONTRACT_INCLUDE }>;

export interface ContractDto {
  id: string;
  counterpartyId: string;
  counterpartyName: string;
  documentId: string | null;
  title: string;
  defaultAmount: number;
  vatRate: number;
  currency: string;
  billingDay: number;
  paymentDueDays: number;
  esfRequired: boolean;
  active: boolean;
  startDate: string | null;
  endDate: string | null;
}

export function toContractDto(contract: ContractWithCounterparty): ContractDto {
  return {
    id: contract.id,
    counterpartyId: contract.counterpartyId,
    counterpartyName: contract.counterparty.name,
    documentId: contract.documentId,
    title: contract.title,
    defaultAmount: contract.defaultAmount.toNumber(),
    vatRate: contract.vatRate,
    currency: contract.currency,
    billingDay: contract.billingDay,
    paymentDueDays: contract.paymentDueDays,
    esfRequired: contract.esfRequired,
    active: contract.active,
    startDate: contract.startDate?.toISOString() ?? null,
    endDate: contract.endDate?.toISOString() ?? null,
  };
}

@Injectable()
export class ContractsService {
  constructor(private prisma: PrismaService) {}

  async findAll(organizationId: string, query: ListContractsDto): Promise<ContractDto[]> {
    const contracts = await this.prisma.contract.findMany({
      where: {
        organizationId,
        ...(query.counterpartyId ? { counterpartyId: query.counterpartyId } : {}),
        ...(query.activeOnly ? { active: true } : {}),
        ...(query.search
          ? {
              OR: [
                { title: { contains: query.search, mode: 'insensitive' as const } },
                { counterparty: { name: { contains: query.search, mode: 'insensitive' as const } } },
              ],
            }
          : {}),
      },
      include: CONTRACT_INCLUDE,
      orderBy: [{ active: 'desc' }, { createdAt: 'desc' }],
    });
    return contracts.map(toContractDto);
  }

  async findOne(id: string, organizationId: string): Promise<ContractDto> {
    return toContractDto(await this.findEntity(id, organizationId));
  }

  async create(organizationId: string, dto: CreateContractDto): Promise<ContractDto> {
    await this.assertCounterparty(dto.counterpartyId, organizationId);
    if (dto.documentId) await this.assertDocument(dto.documentId, organizationId);

    const contract = await this.prisma.contract.create({
      data: {
        organizationId,
        counterpartyId: dto.counterpartyId,
        title: dto.title,
        defaultAmount: new Prisma.Decimal(dto.defaultAmount),
        ...(dto.vatRate !== undefined ? { vatRate: dto.vatRate } : {}),
        ...(dto.currency ? { currency: dto.currency } : {}),
        ...(dto.billingDay !== undefined ? { billingDay: dto.billingDay } : {}),
        ...(dto.paymentDueDays !== undefined ? { paymentDueDays: dto.paymentDueDays } : {}),
        ...(dto.esfRequired !== undefined ? { esfRequired: dto.esfRequired } : {}),
        ...(dto.active !== undefined ? { active: dto.active } : {}),
        startDate: dto.startDate ? new Date(dto.startDate) : null,
        endDate: dto.endDate ? new Date(dto.endDate) : null,
        documentId: dto.documentId ?? null,
      },
      include: CONTRACT_INCLUDE,
    });
    return toContractDto(contract);
  }

  async update(id: string, organizationId: string, dto: UpdateContractDto): Promise<ContractDto> {
    await this.findEntity(id, organizationId);
    if (dto.counterpartyId) await this.assertCounterparty(dto.counterpartyId, organizationId);
    if (dto.documentId) await this.assertDocument(dto.documentId, organizationId);

    const data: Prisma.ContractUpdateInput = {};
    if (dto.title !== undefined) data.title = dto.title;
    if (dto.defaultAmount !== undefined) data.defaultAmount = new Prisma.Decimal(dto.defaultAmount);
    if (dto.vatRate !== undefined) data.vatRate = dto.vatRate;
    if (dto.currency !== undefined) data.currency = dto.currency;
    if (dto.billingDay !== undefined) data.billingDay = dto.billingDay;
    if (dto.paymentDueDays !== undefined) data.paymentDueDays = dto.paymentDueDays;
    if (dto.esfRequired !== undefined) data.esfRequired = dto.esfRequired;
    if (dto.active !== undefined) data.active = dto.active;
    if (dto.startDate !== undefined) data.startDate = dto.startDate ? new Date(dto.startDate) : null;
    if (dto.endDate !== undefined) data.endDate = dto.endDate ? new Date(dto.endDate) : null;
    if (dto.counterpartyId !== undefined) {
      data.counterparty = { connect: { id: dto.counterpartyId } };
    }
    if (dto.documentId !== undefined) {
      data.document = dto.documentId ? { connect: { id: dto.documentId } } : { disconnect: true };
    }

    const contract = await this.prisma.contract.update({
      where: { id },
      data,
      include: CONTRACT_INCLUDE,
    });
    return toContractDto(contract);
  }

  async remove(id: string, organizationId: string) {
    await this.findEntity(id, organizationId);
    const settlements = await this.prisma.settlement.count({ where: { contractId: id } });
    if (settlements > 0) {
      throw new BadRequestException(
        'По договору есть расчёты. Сделайте договор неактивным вместо удаления.',
      );
    }
    await this.prisma.contract.delete({ where: { id } });
    return { id };
  }

  private async findEntity(id: string, organizationId: string) {
    const contract = await this.prisma.contract.findFirst({
      where: { id, organizationId },
      include: CONTRACT_INCLUDE,
    });
    if (!contract) throw new NotFoundException('Договор не найден');
    return contract;
  }

  private async assertCounterparty(counterpartyId: string, organizationId: string) {
    const found = await this.prisma.counterparty.findFirst({
      where: { id: counterpartyId, organizationId },
      select: { id: true },
    });
    if (!found) throw new NotFoundException('Контрагент не найден');
  }

  private async assertDocument(documentId: string, organizationId: string) {
    const found = await this.prisma.document.findFirst({
      where: { id: documentId, organizationId },
      select: { id: true },
    });
    if (!found) throw new NotFoundException('Документ не найден');
  }
}
