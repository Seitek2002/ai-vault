import { Injectable, NotFoundException } from '@nestjs/common';
import {
  DocumentType,
  Prisma,
  type CompanySettings,
  type Contract,
  type Counterparty,
  type Settlement,
} from '@prisma/client';
import {
  shortPeriodDate,
  SETTLEMENT_DOCUMENT_TEMPLATES,
  substitutePlaceholders,
  type PlaceholderContext,
} from '@ai-vault/doc-placeholders';
import { firstDayOfMonth, isoDate, lastDayOfMonth } from './period.util';

type Tx = Prisma.TransactionClient;

interface PmNodeLike {
  type?: string;
  text?: string;
  content?: PmNodeLike[];
}

/**
 * Выбрасывает пустые текстовые узлы. ProseMirror их запрещает: один такой узел
 * в теле — и TipTap не грузит документ целиком, показывая пустой редактор без
 * единой ошибки. Шаблон из Конструктора вполне может его содержать, поэтому
 * чистим перед сохранением, а не надеемся на аккуратность шаблона.
 */
export function sanitizePm(node: unknown): unknown {
  if (Array.isArray(node)) {
    return node
      .map(sanitizePm)
      .filter((child) => child !== null);
  }
  if (node === null || typeof node !== 'object') return node;

  const n = node as PmNodeLike;
  if (n.type === 'text' && !n.text) return null;

  if (Array.isArray(n.content)) {
    const content = (sanitizePm(n.content) as PmNodeLike[]) ?? [];
    // Абзац без содержимого валиден — это пустая строка; узел text без текста нет.
    const next: PmNodeLike = { ...n };
    if (content.length > 0) next.content = content;
    else delete next.content;
    return next;
  }
  return n;
}

/** Какие документы генерируются автоматически при создании расчёта. */
const GENERATED: Array<{ type: DocumentType; counter: 'act' | 'invoice'; label: string }> = [
  { type: DocumentType.AVR, counter: 'act', label: 'Акт оказанных услуг' },
  { type: DocumentType.INVOICE_PAYMENT, counter: 'invoice', label: 'Счёт на оплату' },
];

@Injectable()
export class SettlementDocsService {
  /**
   * Создаёт черновики акта и счёта для расчёта из шаблонов организации.
   *
   * Шаблон берётся из Конструктора (`DocumentTemplate`) и заполняется тем же
   * `substitutePlaceholders`, что и при ручном создании, — иначе автоматический
   * и ручной документы разошлись бы. Если шаблона нужного типа нет, документ
   * берётся стандартная форма с реквизитами и услугой из договора.
   *
   * Шаги ISSUE_ACT / ISSUE_INVOICE намеренно НЕ закрываются: черновик должен
   * проверить человек, в этом смысл шага.
   */
  async createDraftsForSettlement(
    tx: Tx,
    params: {
      settlement: Settlement;
      counterparty: Counterparty;
      settings: CompanySettings | null;
      userId: string;
      organizationId: string;
      contract?: Contract | undefined;
      types?: DocumentType[];
      templateId?: string | undefined;
    },
  ): Promise<Array<{ id: string; type: DocumentType }>> {
    const { settlement, counterparty, settings, userId, organizationId } = params;
    const created: Array<{ id: string; type: DocumentType }> = [];

    for (const { type, counter, label } of GENERATED.filter(g => !params.types || params.types.includes(g.type))) {
      const existing = await tx.document.findFirst({
        where: { organizationId, settlementId: settlement.id, type },
        orderBy: { createdAt: 'asc' }, select: { id: true, type: true },
      });
      if (existing) { created.push(existing); continue; }
      const template = await this.resolveTemplate(tx, organizationId, type, params.templateId);

      const number = await this.nextNumber(tx, organizationId, counter, settlement.year);
      const context = this.buildContext({ settlement, counterparty, settings, number, contract: params.contract });
      const bodyJson = sanitizePm(
        substitutePlaceholders(template.bodyJson, context),
      ) as Prisma.InputJsonValue;

      const periodEndIso = isoDate(lastDayOfMonth(settlement.year, settlement.month));
      const meta = {
        ...template.metaDefaults,
        ...(type === DocumentType.AVR
          ? { actNumber: number, actDate: periodEndIso }
          : { invoiceNumber: number, invoiceDate: periodEndIso }),
        currency: settlement.currency,
        totalAmount: settlement.amount.toNumber(),
        totalVat: settlement.vatAmount.toNumber(),
        periodStart: isoDate(firstDayOfMonth(settlement.year, settlement.month)),
        periodEnd: periodEndIso,
        serviceName: context.service,
        contractNumber: params.contract?.number,
        contractDate: params.contract?.startDate ? isoDate(params.contract.startDate) : undefined,
        // Retain the source so changing a default template cannot rewrite another form on amount refresh.
        generationTemplate: template.bodyJson,
      } as Prisma.InputJsonValue;

      const doc = await tx.document.create({
        data: {
          organizationId,
          type,
          title: `${label} № ${number} — ${counterparty.name}`,
          number,
          counterpartyId: counterparty.id,
          settlementId: settlement.id,
          ...(template.categoryId ? { categoryId: template.categoryId } : {}),
          meta,
          bodyJson,
          createdById: userId,
        },
        select: { id: true, type: true },
      });

      await tx.documentVersion.create({
        data: { documentId: doc.id, version: 1, bodyJson, createdById: userId },
      });

      created.push(doc);
    }

    return created;
  }

  /**
   * Перерисовывает черновики расчёта после смены суммы.
   *
   * Номер и сам документ сохраняются — меняется только тело, и на него
   * заводится новая версия. Иначе правка суммы расходилась бы с уже
   * сгенерированным актом: в расчёте одна цифра, в документе другая.
   * Тронуты только черновики; выставленный документ правится руками.
   */
  async refreshDraftsForSettlement(
    tx: Tx,
    params: {
      settlement: Settlement;
      counterparty: Counterparty;
      settings: CompanySettings | null;
      userId: string;
      organizationId: string;
      contract?: Contract | undefined;
    },
  ): Promise<number> {
    const { settlement, counterparty, settings, userId, organizationId } = params;

    const drafts = await tx.document.findMany({
      where: { settlementId: settlement.id, status: 'DRAFT' },
      select: { id: true, type: true, number: true, meta: true },
    });

    let updated = 0;
    for (const draft of drafts) {
      const generated = GENERATED.find((g) => g.type === draft.type);
      if (!generated) continue;

      const previousMeta = (draft.meta ?? {}) as Record<string, unknown>;
      const template = previousMeta.generationTemplate
        ? { bodyJson: previousMeta.generationTemplate }
        : await this.resolveTemplate(tx, organizationId, draft.type);

      const context = this.buildContext({
        settlement,
        counterparty,
        settings,
        number: draft.number ?? '',
        contract: params.contract,
      });
      if (!params.contract) {
        context.service = String(previousMeta.serviceName ?? context.service);
        context.contractNumber = previousMeta.contractNumber as string | undefined;
        context.contractDate = previousMeta.contractDate as string | undefined;
      }
      const bodyJson = sanitizePm(
        substitutePlaceholders(template.bodyJson, context),
      ) as Prisma.InputJsonValue;

      const meta = {
        ...(draft.meta as Record<string, unknown>),
        currency: settlement.currency,
        totalAmount: settlement.amount.toNumber(),
        totalVat: settlement.vatAmount.toNumber(),
      } as Prisma.InputJsonValue;

      await tx.document.update({ where: { id: draft.id }, data: { bodyJson, meta } });

      const last = await tx.documentVersion.findFirst({
        where: { documentId: draft.id },
        orderBy: { version: 'desc' },
        select: { version: true },
      });
      await tx.documentVersion.create({
        data: {
          documentId: draft.id,
          version: (last?.version ?? 0) + 1,
          bodyJson,
          createdById: userId,
        },
      });
      updated += 1;
    }

    return updated;
  }

  /** Контекст подстановки: реквизиты обеих сторон, номер, сумма и период месяца. */
  buildContext(params: {
    settlement: Settlement;
    counterparty: Counterparty;
    settings: CompanySettings | null;
    number: string;
    contract?: Contract | undefined;
  }): PlaceholderContext {
    const { settlement, counterparty, settings, number } = params;
    const periodStart = firstDayOfMonth(settlement.year, settlement.month);
    const periodEnd = lastDayOfMonth(settlement.year, settlement.month);

    return {
      org: settings
        ? {
            name: settings.name,
            inn: settings.inn,
            bin: settings.bin,
            address: settings.address,
            bankAccount: settings.bankAccount,
            bankName: settings.bankName,
            bankBik: settings.bankBik,
          }
        : null,
      company: {
        name: counterparty.name,
        inn: counterparty.inn,
        bin: counterparty.bin,
        address: counterparty.address,
        phone: counterparty.phone,
        email: counterparty.email,
        bankAccount: counterparty.bankAccount,
        bankName: counterparty.bankName,
        bankBik: counterparty.bankBik,
      },
      // Документ датируется последним днём расчётного месяца, а не днём генерации.
      dateIso: isoDate(periodEnd),
      number,
      amount: settlement.amount.toNumber(),
      service: settlement.label || params.contract?.title || 'Услуги по договору',
      currency: settlement.currency === 'KGS' ? 'сом' : settlement.currency,
      vatAmount: settlement.vatAmount.toNumber(),
      contractNumber: params.contract?.number,
      contractDate: params.contract?.startDate ? isoDate(params.contract.startDate) : undefined,
      periodStart: shortPeriodDate(isoDate(periodStart)),
      periodEnd: shortPeriodDate(isoDate(periodEnd)),
    };
  }

  /**
   * Сквозной номер: «АВР-2026-014». Счётчик инкрементируется в той же
   * транзакции, что и создание документа, и сбрасывается при смене года.
   */
  async nextNumber(
    tx: Tx,
    organizationId: string,
    counter: 'act' | 'invoice',
    year: number,
  ): Promise<string> {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`document-number:${organizationId}`}))`;
    const settings = await tx.companySettings.findUnique({ where: { organizationId } });
    const isAct = counter === 'act';
    const currentYear = isAct ? settings?.actCounterYear : settings?.invoiceCounterYear;
    const current = (isAct ? settings?.actCounter : settings?.invoiceCounter) ?? 0;
    const prefix = (isAct ? settings?.actPrefix : settings?.invoicePrefix) || (isAct ? 'АВР' : 'СЧ');
    const start = `${prefix}-${year}-`;
    const numbers = await tx.document.findMany({
      where: { organizationId, type: isAct ? DocumentType.AVR : DocumentType.INVOICE_PAYMENT, number: { startsWith: start } },
      select: { number: true },
    });
    const last = numbers.reduce((max, doc) => {
      const suffix = doc.number?.slice(start.length) ?? '';
      return /^\d+$/.test(suffix) ? Math.max(max, Number(suffix)) : max;
    }, currentYear === year ? current : 0);
    const next = last + 1;

    if (settings) await tx.companySettings.update({
      where: { organizationId },
      data: isAct
        ? { actCounter: next, actCounterYear: year }
        : { invoiceCounter: next, invoiceCounterYear: year },
    });

    return `${prefix}-${year}-${String(next).padStart(3, '0')}`;
  }

  /** Шаблон организации: сначала помеченный по умолчанию, иначе самый свежий. */
  private async resolveTemplate(tx: Tx, organizationId: string, type: DocumentType, templateId?: string) {
    if (templateId) {
      const selected = await tx.documentTemplate.findFirst({ where: { id: templateId, organizationId, type } });
      if (!selected) throw new NotFoundException('Шаблон этого типа не найден');
      return { bodyJson: selected.bodyJson as unknown, metaDefaults: (selected.metaDefaults ?? {}) as Record<string, unknown>, categoryId: selected.categoryId };
    }
    const template =
      (await tx.documentTemplate.findFirst({
        where: { organizationId, type, isDefault: true },
        orderBy: { updatedAt: 'desc' },
      })) ??
      (await tx.documentTemplate.findFirst({
        where: { organizationId, type },
        orderBy: { updatedAt: 'desc' },
      }));
    if (!template) return { bodyJson: SETTLEMENT_DOCUMENT_TEMPLATES[type as 'AVR' | 'INVOICE_PAYMENT'], metaDefaults: {}, categoryId: null };

    return {
      bodyJson: template.bodyJson as unknown,
      metaDefaults: (template.metaDefaults ?? {}) as Record<string, unknown>,
      categoryId: template.categoryId,
    };
  }
}
