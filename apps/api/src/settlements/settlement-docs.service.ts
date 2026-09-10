import { Injectable, Logger } from '@nestjs/common';
import {
  DocumentType,
  Prisma,
  type CompanySettings,
  type Counterparty,
  type Settlement,
} from '@prisma/client';
import {
  shortPeriodDate,
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
  private readonly logger = new Logger(SettlementDocsService.name);

  /**
   * Создаёт черновики акта и счёта для расчёта из шаблонов организации.
   *
   * Шаблон берётся из Конструктора (`DocumentTemplate`) и заполняется тем же
   * `substitutePlaceholders`, что и при ручном создании, — иначе автоматический
   * и ручной документы разошлись бы. Если шаблона нужного типа нет, документ
   * не создаётся: выдумывать вёрстку за пользователя не нужно, шаг
   * «Выставить акт» просто останется открытым.
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
    },
  ): Promise<Array<{ id: string; type: DocumentType }>> {
    const { settlement, counterparty, settings, userId, organizationId } = params;
    const created: Array<{ id: string; type: DocumentType }> = [];

    for (const { type, counter, label } of GENERATED) {
      const template = await this.resolveTemplate(tx, organizationId, type);
      if (!template) {
        this.logger.warn(
          `Нет шаблона типа ${type} у организации ${organizationId} — документ не сгенерирован`,
        );
        continue;
      }

      const number = await this.nextNumber(tx, organizationId, counter, settlement.year);
      const context = this.buildContext({ settlement, counterparty, settings, number });
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

  /** Контекст подстановки: реквизиты обеих сторон, номер, сумма и период месяца. */
  buildContext(params: {
    settlement: Settlement;
    counterparty: Counterparty;
    settings: CompanySettings | null;
    number: string;
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
    const settings = await tx.companySettings.findUnique({ where: { organizationId } });
    if (!settings) return `${year}-${Date.now().toString().slice(-4)}`;

    const isAct = counter === 'act';
    const currentYear = isAct ? settings.actCounterYear : settings.invoiceCounterYear;
    const current = isAct ? settings.actCounter : settings.invoiceCounter;
    const next = currentYear === year ? current + 1 : 1;
    const prefix = isAct ? settings.actPrefix : settings.invoicePrefix;

    await tx.companySettings.update({
      where: { organizationId },
      data: isAct
        ? { actCounter: next, actCounterYear: year }
        : { invoiceCounter: next, invoiceCounterYear: year },
    });

    return `${prefix}-${year}-${String(next).padStart(3, '0')}`;
  }

  /** Шаблон организации: сначала помеченный по умолчанию, иначе самый свежий. */
  private async resolveTemplate(tx: Tx, organizationId: string, type: DocumentType) {
    const template =
      (await tx.documentTemplate.findFirst({
        where: { organizationId, type, isDefault: true },
        orderBy: { updatedAt: 'desc' },
      })) ??
      (await tx.documentTemplate.findFirst({
        where: { organizationId, type },
        orderBy: { updatedAt: 'desc' },
      }));
    if (!template) return null;

    return {
      bodyJson: template.bodyJson as unknown,
      metaDefaults: (template.metaDefaults ?? {}) as Record<string, unknown>,
      categoryId: template.categoryId,
    };
  }
}
