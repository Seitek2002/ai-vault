import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import {
  DocumentStatus,
  Prisma,
  SettlementStepType,
  type Contract,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SettlementDocsService } from './settlement-docs.service';
import {
  buildStepPlans,
  deriveStatus,
  extractVat,
  type SettlementStatus,
} from './settlement-steps.util';
import type {
  CompleteStepDto,
  CreatePaymentDto,
  GenerateSettlementsDto,
  ListSettlementsDto,
  UpdateSettlementDto,
} from './dto/settlement.dto';

const SETTLEMENT_INCLUDE = {
  contract: { select: { id: true, title: true, paymentDueDays: true, esfRequired: true } },
  counterparty: { select: { id: true, name: true } },
  steps: {
    orderBy: { order: 'asc' as const },
    include: { doneBy: { select: { id: true, name: true } } },
  },
  payments: { orderBy: { paidAt: 'asc' as const } },
} satisfies Prisma.SettlementInclude;

type SettlementRow = Prisma.SettlementGetPayload<{ include: typeof SETTLEMENT_INCLUDE }>;

export interface SettlementStepDto {
  id: string;
  type: SettlementStepType;
  order: number;
  dueDate: string | null;
  doneAt: string | null;
  doneByName: string | null;
  documentId: string | null;
  fileAssetId: string | null;
  paymentId: string | null;
  note: string | null;
  overdue: boolean;
}

export interface PaymentDto {
  id: string;
  amount: number;
  paidAt: string;
  reference: string | null;
  fileAssetId: string | null;
}

export interface SettlementDto {
  id: string;
  contractId: string;
  contractTitle: string;
  counterpartyId: string;
  counterpartyName: string;
  year: number;
  month: number;
  amount: number;
  vatAmount: number;
  currency: string;
  paidAmount: number;
  dueAmount: number;
  status: SettlementStatus;
  closedAt: string | null;
  steps: SettlementStepDto[];
  payments: PaymentDto[];
}

export interface MonthBoardDto {
  year: number;
  month: number;
  settlements: SettlementDto[];
  totals: {
    count: number;
    overdue: number;
    toIssue: number;
    waitingSigned: number;
    waitingEsf: number;
    unpaidAmount: number;
  };
}

@Injectable()
export class SettlementsService {
  constructor(
    private prisma: PrismaService,
    private docs: SettlementDocsService,
  ) {}

  // ── Чтение ────────────────────────────────────────────────────────────────

  async findAll(organizationId: string, query: ListSettlementsDto): Promise<MonthBoardDto> {
    const rows = await this.prisma.settlement.findMany({
      where: {
        organizationId,
        year: query.year,
        month: query.month,
        ...(query.counterpartyId ? { counterpartyId: query.counterpartyId } : {}),
      },
      include: SETTLEMENT_INCLUDE,
      orderBy: { counterparty: { name: 'asc' } },
    });

    const now = new Date();
    const settlements = rows.map((row) => this.toDto(row, now));

    return {
      year: query.year,
      month: query.month,
      settlements,
      totals: this.buildTotals(settlements),
    };
  }

  /** История расчётов по контрагенту — для вкладки на странице компании. */
  async findByCounterparty(organizationId: string, counterpartyId: string): Promise<SettlementDto[]> {
    const rows = await this.prisma.settlement.findMany({
      where: { organizationId, counterpartyId },
      include: SETTLEMENT_INCLUDE,
      orderBy: [{ year: 'desc' }, { month: 'desc' }],
    });
    const now = new Date();
    return rows.map((row) => this.toDto(row, now));
  }

  async findOne(id: string, organizationId: string) {
    const row = await this.prisma.settlement.findFirst({
      where: { id, organizationId },
      include: SETTLEMENT_INCLUDE,
    });
    if (!row) throw new NotFoundException('Расчёт не найден');

    const [documents, fileAssets] = await Promise.all([
      this.prisma.document.findMany({
        where: { settlementId: id },
        select: { id: true, type: true, status: true, title: true, number: true, updatedAt: true },
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.fileAsset.findMany({
        where: { settlementId: id },
        select: {
          id: true,
          originalName: true,
          mimeType: true,
          size: true,
          s3Url: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'asc' },
      }),
    ]);

    return { ...this.toDto(row, new Date()), documents, fileAssets };
  }

  // ── Генерация месяца ──────────────────────────────────────────────────────

  /**
   * Идемпотентно: расчёт уникален по (contractId, year, month), существующие
   * пропускаются. Поэтому и cron, и кнопка «Сформировать месяц» безопасны.
   */
  async generate(organizationId: string, userId: string, dto: GenerateSettlementsDto) {
    const periodStart = new Date(Date.UTC(dto.year, dto.month - 1, 1));
    const periodEnd = new Date(Date.UTC(dto.year, dto.month, 0));

    const contracts = await this.prisma.contract.findMany({
      where: {
        organizationId,
        active: true,
        ...(dto.contractId ? { id: dto.contractId } : {}),
        AND: [
          { OR: [{ startDate: null }, { startDate: { lte: periodEnd } }] },
          { OR: [{ endDate: null }, { endDate: { gte: periodStart } }] },
        ],
      },
    });

    let created = 0;
    let skipped = 0;
    const ids: string[] = [];

    for (const contract of contracts) {
      const settlementId = await this.generateOne(contract, dto.year, dto.month, userId);
      if (settlementId) {
        created += 1;
        ids.push(settlementId);
      } else {
        skipped += 1;
      }
    }

    return { created, skipped, settlementIds: ids };
  }

  /** Возвращает id созданного расчёта или null, если он уже существовал. */
  async generateOne(
    contract: Contract,
    year: number,
    month: number,
    userId: string,
  ): Promise<string | null> {
    const existing = await this.prisma.settlement.findUnique({
      where: { contractId_year_month: { contractId: contract.id, year, month } },
      select: { id: true },
    });
    if (existing) return null;

    const vatAmount = new Prisma.Decimal(
      extractVat(contract.defaultAmount.toNumber(), contract.vatRate, contract.esfRequired),
    );

    try {
      return await this.prisma.$transaction(async (tx) => {
        const settlement = await tx.settlement.create({
          data: {
            organizationId: contract.organizationId,
            contractId: contract.id,
            counterpartyId: contract.counterpartyId,
            year,
            month,
            amount: contract.defaultAmount,
            vatAmount,
            currency: contract.currency,
            steps: {
              create: buildStepPlans(year, month, {
                esfRequired: contract.esfRequired,
                paymentDueDays: contract.paymentDueDays,
              }),
            },
          },
        });

        const counterparty = await tx.counterparty.findUniqueOrThrow({
          where: { id: contract.counterpartyId },
        });
        const settings = await tx.companySettings.findUnique({
          where: { organizationId: contract.organizationId },
        });

        const drafts = await this.docs.createDraftsForSettlement(tx, {
          settlement,
          counterparty,
          settings,
          userId,
          organizationId: contract.organizationId,
        });

        // Черновик сразу привязывается к своему шагу — чтобы из ячейки
        // дашборда открывался нужный документ ещё до его проверки.
        for (const draft of drafts) {
          const stepType =
            draft.type === 'AVR'
              ? SettlementStepType.ISSUE_ACT
              : SettlementStepType.ISSUE_INVOICE;
          await tx.settlementStep.update({
            where: { settlementId_type: { settlementId: settlement.id, type: stepType } },
            data: { documentId: draft.id },
          });
        }

        return settlement.id;
      });
    } catch (error) {
      // Гонка между cron и ручной генерацией — уникальный индекс отработал.
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        return null;
      }
      throw error;
    }
  }

  // ── Правки расчёта ────────────────────────────────────────────────────────

  async update(
    id: string,
    organizationId: string,
    userId: string,
    dto: UpdateSettlementDto,
  ) {
    const settlement = await this.getEntity(id, organizationId);

    if (dto.amount !== undefined) {
      const finalized = await this.prisma.document.count({
        where: { settlementId: id, status: { not: DocumentStatus.DRAFT } },
      });
      if (finalized > 0) {
        throw new BadRequestException(
          'Документы расчёта уже выставлены — сумму менять нельзя. Отмените шаг выставления.',
        );
      }
    }

    const data: Prisma.SettlementUpdateInput = {};
    if (dto.amount !== undefined) {
      data.amount = new Prisma.Decimal(dto.amount);

      // НДС пересчитывается вместе с суммой, иначе остался бы от прежней.
      // Явно переданный vatAmount ниже перекрывает расчётный.
      if (dto.vatAmount === undefined) {
        const contract = await this.prisma.contract.findUnique({
          where: { id: settlement.contractId },
          select: { vatRate: true, esfRequired: true },
        });
        data.vatAmount = new Prisma.Decimal(
          extractVat(dto.amount, contract?.vatRate ?? 0, contract?.esfRequired ?? false),
        );
      }
    }
    if (dto.vatAmount !== undefined) data.vatAmount = new Prisma.Decimal(dto.vatAmount);

    await this.prisma.$transaction(async (tx) => {
      const updated = await tx.settlement.update({ where: { id: settlement.id }, data });

      // Черновики перерисовываем той же транзакцией: сумма в расчёте и сумма
      // в акте не должны разъезжаться даже на мгновение.
      if (dto.amount !== undefined || dto.vatAmount !== undefined) {
        const [counterparty, settings] = await Promise.all([
          tx.counterparty.findUniqueOrThrow({ where: { id: updated.counterpartyId } }),
          tx.companySettings.findUnique({ where: { organizationId } }),
        ]);
        await this.docs.refreshDraftsForSettlement(tx, {
          settlement: updated,
          counterparty,
          settings,
          userId,
          organizationId,
        });
      }
    });

    await this.syncPaymentStep(id);
    return this.findOne(id, organizationId);
  }

  async remove(id: string, organizationId: string) {
    await this.getEntity(id, organizationId);
    await this.prisma.settlement.delete({ where: { id } });
    return { id };
  }

  // ── Шаги ──────────────────────────────────────────────────────────────────

  async completeStep(
    settlementId: string,
    stepId: string,
    organizationId: string,
    userId: string,
    dto: CompleteStepDto,
  ) {
    await this.getEntity(settlementId, organizationId);
    const step = await this.prisma.settlementStep.findFirst({
      where: { id: stepId, settlementId },
    });
    if (!step) throw new NotFoundException('Шаг не найден');

    if (dto.documentId) await this.assertDocument(dto.documentId, organizationId);
    if (dto.fileAssetId) await this.assertFileAsset(dto.fileAssetId, organizationId);

    if (step.type === SettlementStepType.RECEIVE_PAYMENT) {
      throw new BadRequestException(
        'Шаг оплаты закрывается внесением платежа, а не вручную.',
      );
    }
    if (step.type === SettlementStepType.RECEIVE_SIGNED && !dto.fileAssetId) {
      throw new BadRequestException('Приложите скан подписанного документа.');
    }
    if (step.type === SettlementStepType.ISSUE_ESF && !dto.note?.trim()) {
      throw new BadRequestException('Укажите номер и дату ЭСФ.');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.settlementStep.update({
        where: { id: stepId },
        data: {
          doneAt: new Date(),
          doneById: userId,
          ...(dto.note !== undefined ? { note: dto.note } : {}),
          ...(dto.documentId ? { documentId: dto.documentId } : {}),
          ...(dto.fileAssetId ? { fileAssetId: dto.fileAssetId } : {}),
        },
      });
      await this.applyStepSideEffects(tx, settlementId, step.type, dto);
    });

    await this.refreshClosedAt(settlementId);
    return this.findOne(settlementId, organizationId);
  }

  async reopenStep(settlementId: string, stepId: string, organizationId: string) {
    await this.getEntity(settlementId, organizationId);
    const step = await this.prisma.settlementStep.findFirst({
      where: { id: stepId, settlementId },
    });
    if (!step) throw new NotFoundException('Шаг не найден');

    if (step.type === SettlementStepType.RECEIVE_PAYMENT) {
      throw new BadRequestException('Шаг оплаты открывается удалением платежа.');
    }

    await this.prisma.settlementStep.update({
      where: { id: stepId },
      data: { doneAt: null, doneById: null },
    });
    await this.refreshClosedAt(settlementId);
    return this.findOne(settlementId, organizationId);
  }

  /**
   * Побочные эффекты закрытия шага. Статусы документов ведутся отсюда, чтобы
   * они не расходились с чек-листом.
   */
  private async applyStepSideEffects(
    tx: Prisma.TransactionClient,
    settlementId: string,
    type: SettlementStepType,
    dto: CompleteStepDto,
  ) {
    if (type === SettlementStepType.ISSUE_ACT || type === SettlementStepType.ISSUE_INVOICE) {
      const documentType = type === SettlementStepType.ISSUE_ACT ? 'AVR' : 'INVOICE_PAYMENT';
      await tx.document.updateMany({
        where: { settlementId, type: documentType, status: DocumentStatus.DRAFT },
        data: { status: DocumentStatus.FINAL },
      });
      return;
    }

    if (type === SettlementStepType.SEND) {
      await tx.document.updateMany({
        where: { settlementId, status: { in: [DocumentStatus.DRAFT, DocumentStatus.FINAL] } },
        data: { status: DocumentStatus.SENT },
      });
      return;
    }

    if (type === SettlementStepType.RECEIVE_SIGNED) {
      if (dto.fileAssetId) {
        await tx.fileAsset.update({
          where: { id: dto.fileAssetId },
          data: { settlementId },
        });
      }
      // Подписан прежде всего акт — он закрывает месяц.
      await tx.document.updateMany({
        where: { settlementId, type: 'AVR' },
        data: { status: DocumentStatus.SIGNED },
      });
    }
  }

  // ── Оплаты ────────────────────────────────────────────────────────────────

  async addPayment(
    settlementId: string,
    organizationId: string,
    userId: string,
    dto: CreatePaymentDto,
  ) {
    const settlement = await this.getEntity(settlementId, organizationId);
    if (dto.fileAssetId) await this.assertFileAsset(dto.fileAssetId, organizationId);

    await this.prisma.payment.create({
      data: {
        organizationId,
        counterpartyId: settlement.counterpartyId,
        settlementId,
        amount: new Prisma.Decimal(dto.amount),
        paidAt: new Date(dto.paidAt),
        reference: dto.reference ?? null,
        fileAssetId: dto.fileAssetId ?? null,
        createdById: userId,
      },
    });

    await this.syncPaymentStep(settlementId);
    await this.refreshClosedAt(settlementId);
    return this.findOne(settlementId, organizationId);
  }

  async removePayment(settlementId: string, paymentId: string, organizationId: string) {
    await this.getEntity(settlementId, organizationId);
    const payment = await this.prisma.payment.findFirst({
      where: { id: paymentId, settlementId, organizationId },
    });
    if (!payment) throw new NotFoundException('Платёж не найден');

    await this.prisma.payment.delete({ where: { id: paymentId } });
    await this.syncPaymentStep(settlementId);
    await this.refreshClosedAt(settlementId);
    return this.findOne(settlementId, organizationId);
  }

  /**
   * Шаг оплаты закрывается, когда сумма платежей покрыла расчёт, и снова
   * открывается, если платёж удалили или сумму подняли. Частичные оплаты
   * поэтому не требуют отдельного состояния.
   */
  private async syncPaymentStep(settlementId: string) {
    const [settlement, aggregate, step] = await Promise.all([
      this.prisma.settlement.findUnique({
        where: { id: settlementId },
        select: { amount: true },
      }),
      this.prisma.payment.aggregate({
        where: { settlementId },
        _sum: { amount: true },
        _max: { id: true },
      }),
      this.prisma.settlementStep.findUnique({
        where: {
          settlementId_type: { settlementId, type: SettlementStepType.RECEIVE_PAYMENT },
        },
      }),
    ]);
    if (!settlement || !step) return;

    const paid = aggregate._sum.amount ?? new Prisma.Decimal(0);
    const covered = paid.greaterThanOrEqualTo(settlement.amount) && paid.greaterThan(0);

    if (covered && step.doneAt === null) {
      const last = await this.prisma.payment.findFirst({
        where: { settlementId },
        orderBy: { paidAt: 'desc' },
        select: { id: true, paidAt: true },
      });
      await this.prisma.settlementStep.update({
        where: { id: step.id },
        data: { doneAt: last?.paidAt ?? new Date(), paymentId: last?.id ?? null },
      });
    } else if (!covered && step.doneAt !== null) {
      await this.prisma.settlementStep.update({
        where: { id: step.id },
        data: { doneAt: null, paymentId: null },
      });
    }
  }

  /** closedAt держится в согласии с шагами: закрыт, когда закрыты все. */
  private async refreshClosedAt(settlementId: string) {
    const open = await this.prisma.settlementStep.count({
      where: { settlementId, doneAt: null },
    });
    const settlement = await this.prisma.settlement.findUnique({
      where: { id: settlementId },
      select: { closedAt: true },
    });
    if (!settlement) return;

    if (open === 0 && settlement.closedAt === null) {
      await this.prisma.settlement.update({
        where: { id: settlementId },
        data: { closedAt: new Date() },
      });
    } else if (open > 0 && settlement.closedAt !== null) {
      await this.prisma.settlement.update({
        where: { id: settlementId },
        data: { closedAt: null },
      });
    }
  }

  // ── Вспомогательное ───────────────────────────────────────────────────────

  private toDto(row: SettlementRow, now: Date): SettlementDto {
    const paid = row.payments.reduce((sum, p) => sum + p.amount.toNumber(), 0);
    const amount = row.amount.toNumber();

    return {
      id: row.id,
      contractId: row.contractId,
      contractTitle: row.contract.title,
      counterpartyId: row.counterpartyId,
      counterpartyName: row.counterparty.name,
      year: row.year,
      month: row.month,
      amount,
      vatAmount: row.vatAmount.toNumber(),
      currency: row.currency,
      paidAmount: paid,
      dueAmount: Math.max(0, Math.round((amount - paid) * 100) / 100),
      status: deriveStatus(row.steps, now),
      closedAt: row.closedAt?.toISOString() ?? null,
      steps: row.steps.map((step) => ({
        id: step.id,
        type: step.type,
        order: step.order,
        dueDate: step.dueDate?.toISOString() ?? null,
        doneAt: step.doneAt?.toISOString() ?? null,
        doneByName: step.doneBy?.name ?? null,
        documentId: step.documentId,
        fileAssetId: step.fileAssetId,
        paymentId: step.paymentId,
        note: step.note,
        overdue:
          step.doneAt === null &&
          step.dueDate !== null &&
          step.dueDate.getTime() < now.getTime(),
      })),
      payments: row.payments.map((p) => ({
        id: p.id,
        amount: p.amount.toNumber(),
        paidAt: p.paidAt.toISOString(),
        reference: p.reference,
        fileAssetId: p.fileAssetId,
      })),
    };
  }

  private buildTotals(settlements: SettlementDto[]): MonthBoardDto['totals'] {
    const openOfType = (s: SettlementDto, type: SettlementStepType) =>
      s.steps.some((step) => step.type === type && step.doneAt === null);

    return {
      count: settlements.length,
      overdue: settlements.filter((s) => s.status === 'overdue').length,
      toIssue: settlements.filter(
        (s) =>
          openOfType(s, SettlementStepType.ISSUE_ACT) ||
          openOfType(s, SettlementStepType.ISSUE_INVOICE),
      ).length,
      waitingSigned: settlements.filter((s) =>
        openOfType(s, SettlementStepType.RECEIVE_SIGNED),
      ).length,
      waitingEsf: settlements.filter((s) => openOfType(s, SettlementStepType.ISSUE_ESF))
        .length,
      unpaidAmount:
        Math.round(settlements.reduce((sum, s) => sum + s.dueAmount, 0) * 100) / 100,
    };
  }

  private async getEntity(id: string, organizationId: string) {
    const settlement = await this.prisma.settlement.findFirst({
      where: { id, organizationId },
    });
    if (!settlement) throw new NotFoundException('Расчёт не найден');
    return settlement;
  }

  private async assertDocument(documentId: string, organizationId: string) {
    const found = await this.prisma.document.findFirst({
      where: { id: documentId, organizationId },
      select: { id: true },
    });
    if (!found) throw new NotFoundException('Документ не найден');
  }

  private async assertFileAsset(fileAssetId: string, organizationId: string) {
    const found = await this.prisma.fileAsset.findFirst({
      where: { id: fileAssetId, organizationId },
      select: { id: true },
    });
    if (!found) throw new NotFoundException('Файл не найден');
  }
}
