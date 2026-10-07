import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { calculateContractEndDate } from '@ai-vault/doc-placeholders';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { MAX_UPLOAD_SIZE_BYTES, MAX_UPLOAD_SIZE_MB } from '../files/upload-limits';
import type { CreateContractDto, ListContractsDto, UpdateContractDto } from './dto/contract.dto';

const ATTACHMENT_SELECT = { id: true, originalName: true, size: true } as const;

const CONTRACT_INCLUDE = {
  additionalPdfs: { select: ATTACHMENT_SELECT, orderBy: { createdAt: 'asc' as const } },
  contractPdf: { select: ATTACHMENT_SELECT },
  ndaPdf: { select: ATTACHMENT_SELECT },
  counterparty: { select: { id: true, name: true, inn: true } },
} satisfies Prisma.ContractInclude;

type ContractWithCounterparty = Prisma.ContractGetPayload<{ include: typeof CONTRACT_INCLUDE }>;

export interface ContractDto {
  id: string;
  number: string;
  counterpartyId: string;
  counterpartyName: string;
  documentId: string | null;
  contractPdf: { id: string; originalName: string; size: number } | null;
  ndaPdf: { id: string; originalName: string; size: number } | null;
  additionalPdfs: { id: string; originalName: string; size: number }[];
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
  termValue: number | null;
  termUnit: 'MONTHS' | 'YEARS' | null;
}

export function toContractDto(contract: ContractWithCounterparty): ContractDto {
  return {
    id: contract.id,
    number: contract.number,
    counterpartyId: contract.counterpartyId,
    counterpartyName: contract.counterparty.name,
    documentId: contract.documentId,
    contractPdf: contract.contractPdf,
    ndaPdf: contract.ndaPdf,
    additionalPdfs: contract.additionalPdfs,
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
    termValue: contract.termValue,
    termUnit: contract.termUnit,
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
                { number: { contains: query.search, mode: 'insensitive' as const } },
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
    if (dto.contractPdfId) await this.assertPdf(dto.contractPdfId, organizationId);
    if (dto.ndaPdfId) await this.assertPdf(dto.ndaPdfId, organizationId);
    for (const fileId of dto.additionalPdfIds ?? []) await this.assertPdf(fileId, organizationId);

    const dates = this.resolveDates(dto);
    try {
      return await this.prisma.$transaction(async (tx) => {
        // Serialize numbering and manual reservations within this organization.
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${organizationId}))`;
        const number = dto.number?.trim() || await this.nextNumber(tx, organizationId);
        const contract = await tx.contract.create({
          data: {
            organizationId,
            number,
            counterpartyId: dto.counterpartyId,
            title: dto.title,
            defaultAmount: new Prisma.Decimal(dto.defaultAmount),
            ...(dto.vatRate !== undefined ? { vatRate: dto.vatRate } : {}),
            ...(dto.currency ? { currency: dto.currency } : {}),
            ...(dto.billingDay !== undefined ? { billingDay: dto.billingDay } : {}),
            ...(dto.paymentDueDays !== undefined ? { paymentDueDays: dto.paymentDueDays } : {}),
            ...(dto.esfRequired !== undefined ? { esfRequired: dto.esfRequired } : {}),
            ...(dto.active !== undefined ? { active: dto.active } : {}),
            ...dates,
            documentId: dto.documentId ?? null,
            contractPdfId: dto.contractPdfId ?? null,
            ndaPdfId: dto.ndaPdfId ?? null,
            additionalPdfs: { connect: (dto.additionalPdfIds ?? []).map((id) => ({ id })) },
          },
          include: CONTRACT_INCLUDE,
        });
        return toContractDto(contract);
      });
    } catch (error) {
      this.rethrowNumberConflict(error);
    }
  }

  async update(id: string, organizationId: string, dto: UpdateContractDto): Promise<ContractDto> {
    const existing = await this.findEntity(id, organizationId);
    if (dto.counterpartyId) await this.assertCounterparty(dto.counterpartyId, organizationId);
    if (dto.documentId) await this.assertDocument(dto.documentId, organizationId);
    if (dto.contractPdfId) await this.assertPdf(dto.contractPdfId, organizationId);
    if (dto.ndaPdfId) await this.assertPdf(dto.ndaPdfId, organizationId);
    for (const fileId of dto.additionalPdfIds ?? []) await this.assertPdf(fileId, organizationId);

    const data: Prisma.ContractUpdateInput = {};
    if (dto.number !== undefined) {
      const number = dto.number?.trim();
      if (!number) throw new BadRequestException('Номер договора не может быть пустым');
      data.number = number;
    }
    if (dto.title !== undefined) data.title = dto.title;
    if (dto.defaultAmount !== undefined) data.defaultAmount = new Prisma.Decimal(dto.defaultAmount);
    if (dto.vatRate !== undefined) data.vatRate = dto.vatRate;
    if (dto.currency !== undefined) data.currency = dto.currency;
    if (dto.billingDay !== undefined) data.billingDay = dto.billingDay;
    if (dto.paymentDueDays !== undefined) data.paymentDueDays = dto.paymentDueDays;
    if (dto.esfRequired !== undefined) data.esfRequired = dto.esfRequired;
    if (dto.active !== undefined) data.active = dto.active;
    if (dto.startDate !== undefined || dto.endDate !== undefined || dto.termValue !== undefined || dto.termUnit !== undefined) {
      Object.assign(data, this.resolveDates(dto, existing));
    }
    if (dto.counterpartyId !== undefined) {
      data.counterparty = { connect: { id: dto.counterpartyId } };
    }
    if (dto.documentId !== undefined) {
      data.document = dto.documentId ? { connect: { id: dto.documentId } } : { disconnect: true };
    }

    if (dto.contractPdfId !== undefined) {
      data.contractPdf = dto.contractPdfId ? { connect: { id: dto.contractPdfId } } : { disconnect: true };
    }
    if (dto.ndaPdfId !== undefined) {
      data.ndaPdf = dto.ndaPdfId ? { connect: { id: dto.ndaPdfId } } : { disconnect: true };
    }

    if (dto.additionalPdfIds !== undefined && dto.additionalPdfIds !== null) {
      data.additionalPdfs = { set: dto.additionalPdfIds.map((id) => ({ id })) };
    }

    try {
      return await this.prisma.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${organizationId}))`;
        const contract = await tx.contract.update({ where: { id }, data, include: CONTRACT_INCLUDE });
        return toContractDto(contract);
      });
    } catch (error) {
      this.rethrowNumberConflict(error);
    }
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

  private resolveDates(dto: UpdateContractDto, existing?: ContractWithCounterparty) {
    const startDate = dto.startDate !== undefined ? (dto.startDate ? new Date(dto.startDate) : null) : existing?.startDate ?? null;
    const termValue = dto.termValue !== undefined ? dto.termValue : existing?.termValue ?? null;
    const termUnit = dto.termUnit !== undefined ? dto.termUnit : existing?.termUnit ?? null;
    let endDate = dto.endDate !== undefined ? (dto.endDate ? new Date(dto.endDate) : null) : existing?.endDate ?? null;
    if ((termValue === null) !== (termUnit === null)) {
      throw new BadRequestException('Укажите срок и единицу: месяцы или годы');
    }
    if (termValue !== null && termUnit !== null) {
      if (!startDate || Number.isNaN(startDate.getTime())) throw new BadRequestException('Укажите дату начала договора');
      const calculated = calculateContractEndDate(startDate.toISOString(), termValue, termUnit);
      if (!calculated) throw new BadRequestException('Срок должен быть целым числом от 1 до 1200 месяцев или от 1 до 100 лет');
      endDate = new Date(`${calculated}T00:00:00.000Z`);
    } else if (dto.termValue === null && dto.termUnit === null) {
      endDate = null;
    }
    if ((startDate && Number.isNaN(startDate.getTime())) || (endDate && Number.isNaN(endDate.getTime()))) {
      throw new BadRequestException('Некорректная дата договора');
    }
    if (startDate && endDate && endDate < startDate) throw new BadRequestException('Окончание не может быть раньше начала договора');
    return { startDate, endDate, termValue, termUnit };
  }

  private async nextNumber(tx: Prisma.TransactionClient, organizationId: string): Promise<string> {
    while (true) {
      const counter = await tx.contractNumberCounter.upsert({
        where: { organizationId },
        create: { organizationId, lastNumber: 1 },
        update: { lastNumber: { increment: 1 } },
      });
      const number = `ДГ-${String(counter.lastNumber).padStart(6, '0')}`;
      const exists = await tx.contract.findFirst({ where: { organizationId, number }, select: { id: true } });
      if (!exists) return number;
    }
  }

  private rethrowNumberConflict(error: unknown): never {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002' &&
        Array.isArray(error.meta?.['target']) && error.meta['target'].includes('number')) {
      throw new BadRequestException('Договор с таким номером уже существует');
    }
    throw error;
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

  private async assertPdf(id: string, organizationId: string) {
    const file = await this.prisma.fileAsset.findFirst({
      where: { id, organizationId },
      select: { mimeType: true, size: true },
    });
    if (!file) throw new NotFoundException('Файл не найден');
    if (file.mimeType !== 'application/pdf') {
      throw new BadRequestException('Вложения договора должны быть в формате PDF');
    }
    if (file.size <= 0 || file.size > MAX_UPLOAD_SIZE_BYTES) {
      throw new BadRequestException(`Вложения договора должны быть непустыми PDF размером до ${MAX_UPLOAD_SIZE_MB} МБ`);
    }
  }

  private async assertDocument(documentId: string, organizationId: string) {
    const found = await this.prisma.document.findFirst({
      where: { id: documentId, organizationId },
      select: { id: true },
    });
    if (!found) throw new NotFoundException('Документ не найден');
  }
}
