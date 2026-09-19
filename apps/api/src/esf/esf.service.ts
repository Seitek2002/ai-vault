import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { EsfStatus, Prisma, SettlementStepType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { open as openSecret } from '../common/secret-box';
import { EsfPortalClient, EsfPortalError, type EsfListRow } from './esf-portal.client';
import { EsfPdfService } from './esf-pdf';
import {
  RETAIL_INN,
  mapPortalStatus,
  matchSettlement,
  normalizeCompanyName,
  parsePortalAmount,
  parsePortalDate,
  statusClosesStep,
  type SettlementCandidate,
} from './esf-matching';

export interface SyncReport {
  fetched: number;
  created: number;
  updated: number;
  matched: number;
  unmatched: number;
  errors: string[];
}

export interface EsfInvoiceDto {
  id: string;
  uuid: string;
  number: string | null;
  status: EsfStatus;
  deliveryDate: string | null;
  issuedOn: string | null;
  buyerInn: string | null;
  buyerName: string;
  amount: number;
  crmRef: string | null;
  note: string | null;
  counterpartyId: string | null;
  counterpartyName: string | null;
  settlementId: string | null;
  fileAssetId: string | null;
  matchNote: string | null;
  importedAt: string;
}

const INCLUDE = {
  counterparty: { select: { id: true, name: true } },
} satisfies Prisma.EsfInvoiceInclude;

type Row = Prisma.EsfInvoiceGetPayload<{ include: typeof INCLUDE }>;

@Injectable()
export class EsfService {
  private readonly logger = new Logger(EsfService.name);

  constructor(
    private prisma: PrismaService,
    private storage: StorageService,
    private portal: EsfPortalClient,
    private pdf: EsfPdfService,
  ) {}

  // ── Синхронизация ─────────────────────────────────────────────────────────

  /**
   * Полный проход: вход в кабинет → список → для новых UUID скачать PDF и
   * сопоставить; для известных — обновить статус. Каждая ЭСФ обрабатывается
   * отдельно: одна битая не срывает остальные.
   */
  async sync(organizationId: string, userId: string): Promise<SyncReport> {
    const settings = await this.prisma.companySettings.findUnique({ where: { organizationId } });
    if (!settings?.esfLogin || !settings.esfPasswordEnc) {
      throw new BadRequestException('Кабинет ЭСФ не подключён — укажите логин и пароль в настройках');
    }

    const report: SyncReport = { fetched: 0, created: 0, updated: 0, matched: 0, unmatched: 0, errors: [] };

    let rows: EsfListRow[];
    try {
      rows = await this.portal.fetchRealizationList(settings.esfLogin, openSecret(settings.esfPasswordEnc));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await this.prisma.companySettings.update({
        where: { organizationId },
        data: { esfLastSyncError: message },
      });
      throw new BadRequestException(message);
    }
    report.fetched = rows.length;

    const known = new Map(
      (
        await this.prisma.esfInvoice.findMany({
          where: { organizationId },
          select: { id: true, uuid: true, status: true, settlementId: true },
        })
      ).map((r) => [r.uuid, r]),
    );

    for (const row of rows) {
      try {
        const existing = known.get(row.uuid);
        if (existing) {
          const changed = await this.refreshExisting(existing, row, organizationId, userId);
          if (changed === 'rematched') report.matched += 1;
          else if (changed === 'status') report.updated += 1;
          continue;
        }
        const outcome = await this.importNew(organizationId, userId, row);
        report.created += 1;
        if (outcome === 'matched') report.matched += 1;
        else report.unmatched += 1;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        report.errors.push(`${row.number || row.uuid}: ${message}`);
        this.logger.warn(`ЭСФ ${row.uuid}: ${message}`);
      }
    }

    await this.prisma.companySettings.update({
      where: { organizationId },
      data: { esfLastSyncAt: new Date(), esfLastSyncError: report.errors.length ? report.errors.join('; ').slice(0, 1000) : null },
    });

    this.logger.log(
      `Синхронизация ЭСФ ${organizationId}: получено ${report.fetched}, новых ${report.created}, сопоставлено ${report.matched}, ошибок ${report.errors.length}`,
    );
    return report;
  }

  /** Проверка учётных данных до сохранения. */
  async checkConnection(login: string, password: string): Promise<void> {
    try {
      await this.portal.checkCredentials(login, password);
    } catch (error) {
      if (error instanceof EsfPortalError) throw new BadRequestException(error.message);
      throw error;
    }
  }

  private async importNew(organizationId: string, userId: string, row: EsfListRow): Promise<'matched' | 'unmatched'> {
    // PDF — источник ИНН покупателя; в списке портала только наименование.
    const buffer = await this.pdf.download(row.uuid);
    const parsed = await this.pdf.parse(buffer);

    const amount = parsePortalAmount(row.amount) ?? parsed.total ?? 0;
    const status = mapPortalStatus(row.status);
    const buyerInn = parsed.buyerInn;
    const crmRef = row.crmRef || parsed.crmRef;

    const s3Key = `${organizationId}/esf/${row.uuid}.pdf`;
    const s3Url = await this.storage.upload(s3Key, buffer, 'application/pdf');
    const fileAsset = await this.prisma.fileAsset.create({
      data: {
        organizationId,
        originalName: `ЭСФ ${row.number || row.uuid}.pdf`,
        mimeType: 'application/pdf',
        size: buffer.length,
        s3Key,
        s3Url,
        createdById: userId,
      },
    });

    const counterparty = await this.findCounterparty(organizationId, buyerInn, row.counterpartyName);

    let settlementId: string | null = null;
    let matchNote: string | null = null;

    if (buyerInn === RETAIL_INN) {
      matchNote = 'Розничная ЭСФ (ККМ / реализация населению) — не относится к партнёру';
    } else if (!counterparty) {
      matchNote = buyerInn
        ? `Партнёр с ИНН ${buyerInn} не найден в «Компаниях»`
        : 'В ЭСФ не удалось прочитать ИНН покупателя';
    } else {
      const result = matchSettlement(
        { crmRef, deliveryDate: parsePortalDate(row.deliveryDate || parsed.deliveryDate), amount },
        await this.candidatesFor(organizationId, counterparty.id),
      );
      if (result.kind === 'matched') settlementId = result.settlementId;
      else matchNote = result.note;
    }

    await this.prisma.esfInvoice.create({
      data: {
        organizationId,
        uuid: row.uuid,
        number: row.number || parsed.number,
        status,
        createdOn: parsePortalDate(row.createdOn),
        deliveryDate: parsePortalDate(row.deliveryDate || parsed.deliveryDate),
        issuedOn: parsePortalDate(row.issuedOn),
        buyerInn,
        buyerName: row.counterpartyName || parsed.buyerName || '',
        amount: new Prisma.Decimal(amount),
        crmRef,
        note: row.note || null,
        counterpartyId: counterparty?.id ?? null,
        settlementId,
        fileAssetId: fileAsset.id,
        matchNote,
      },
    });

    if (settlementId) {
      await this.attachToSettlement(settlementId, fileAsset.id, row.number || parsed.number, row.issuedOn, status, userId);
      return 'matched';
    }
    return 'unmatched';
  }

  /** Статус на портале меняется (Отправлен → Принят → иногда Отозван). Ведём его в ногу. */
  private async refreshExisting(
    existing: { id: string; uuid: string; status: EsfStatus; settlementId: string | null },
    row: EsfListRow,
    organizationId: string,
    userId: string,
  ): Promise<'rematched' | 'status' | false> {
    const status = mapPortalStatus(row.status);

    // Без расчёта — пробуем снова: партнёру могли проставить ИНН, расчёт
    // могли сформировать позже. Иначе ЭСФ застряла бы «без расчёта» навсегда.
    if (!existing.settlementId && (await this.rematch(existing.id, organizationId, userId))) {
      return 'rematched';
    }

    if (status === existing.status) return false;

    await this.prisma.esfInvoice.update({
      where: { id: existing.id },
      data: {
        status,
        ...(row.number ? { number: row.number } : {}),
        issuedOn: parsePortalDate(row.issuedOn),
      },
    });

    if (existing.settlementId) {
      const step = await this.esfStep(existing.settlementId);
      if (!step) return 'status';
      if (statusClosesStep(status) && !step.doneAt) {
        await this.prisma.settlementStep.update({
          where: { id: step.id },
          data: { doneAt: new Date(), note: this.stepNote(row.number, row.issuedOn) },
        });
      } else if (!statusClosesStep(status) && step.doneAt) {
        // ЭСФ отозвали или отклонили после того, как мы её зачли — шаг снова открыт.
        await this.prisma.settlementStep.update({
          where: { id: step.id },
          data: { doneAt: null, doneById: null, note: `ЭСФ ${row.number} — ${row.status.toLowerCase()} на портале` },
        });
      }
      await this.refreshClosedAt(existing.settlementId);
    }
    return 'status';
  }

  /** Повторное сопоставление уже импортированной ЭСФ. true — привязалась. */
  private async rematch(invoiceId: string, organizationId: string, userId: string): Promise<boolean> {
    const inv = await this.prisma.esfInvoice.findUnique({ where: { id: invoiceId } });
    if (!inv || inv.settlementId || inv.buyerInn === RETAIL_INN) return false;

    const counterparty =
      (inv.counterpartyId ? { id: inv.counterpartyId } : null) ??
      (await this.findCounterparty(organizationId, inv.buyerInn, inv.buyerName));
    if (!counterparty) return false;

    const result = matchSettlement(
      { crmRef: inv.crmRef, deliveryDate: inv.deliveryDate, amount: inv.amount.toNumber() },
      await this.candidatesFor(organizationId, counterparty.id),
    );

    const note = result.kind === 'matched' ? null : result.note;
    await this.prisma.esfInvoice.update({
      where: { id: inv.id },
      data: {
        counterpartyId: counterparty.id,
        ...(result.kind === 'matched' ? { settlementId: result.settlementId } : {}),
        matchNote: note,
      },
    });
    if (result.kind !== 'matched') return false;

    await this.attachToSettlement(
      result.settlementId,
      inv.fileAssetId,
      inv.number,
      inv.issuedOn ? this.formatDate(inv.issuedOn) : '',
      inv.status,
      userId,
    );
    return true;
  }

  // ── Ручная привязка ───────────────────────────────────────────────────────

  async attach(organizationId: string, userId: string, invoiceId: string, settlementId: string): Promise<EsfInvoiceDto> {
    const invoice = await this.prisma.esfInvoice.findFirst({ where: { id: invoiceId, organizationId } });
    if (!invoice) throw new NotFoundException('ЭСФ не найдена');
    const settlement = await this.prisma.settlement.findFirst({ where: { id: settlementId, organizationId } });
    if (!settlement) throw new NotFoundException('Расчёт не найден');

    const taken = await this.prisma.esfInvoice.findFirst({
      where: { settlementId, id: { not: invoiceId } },
      select: { number: true },
    });
    if (taken) throw new BadRequestException(`На этом расчёте уже есть ЭСФ ${taken.number ?? ''}`);

    await this.prisma.esfInvoice.update({
      where: { id: invoiceId },
      data: { settlementId, matchNote: null, counterpartyId: invoice.counterpartyId ?? settlement.counterpartyId },
    });
    await this.attachToSettlement(
      settlementId,
      invoice.fileAssetId,
      invoice.number,
      invoice.issuedOn ? this.formatDate(invoice.issuedOn) : '',
      invoice.status,
      userId,
    );
    return this.findOneDto(invoiceId, organizationId);
  }

  async detach(organizationId: string, invoiceId: string): Promise<EsfInvoiceDto> {
    const invoice = await this.prisma.esfInvoice.findFirst({ where: { id: invoiceId, organizationId } });
    if (!invoice) throw new NotFoundException('ЭСФ не найдена');
    if (invoice.settlementId) {
      const step = await this.esfStep(invoice.settlementId);
      if (step?.fileAssetId === invoice.fileAssetId) {
        await this.prisma.settlementStep.update({
          where: { id: step.id },
          data: { doneAt: null, doneById: null, fileAssetId: null, note: null },
        });
      }
      if (invoice.fileAssetId) {
        await this.prisma.fileAsset.update({ where: { id: invoice.fileAssetId }, data: { settlementId: null } });
      }
      await this.refreshClosedAt(invoice.settlementId);
    }
    await this.prisma.esfInvoice.update({
      where: { id: invoiceId },
      data: { settlementId: null, matchNote: 'Отвязана вручную' },
    });
    return this.findOneDto(invoiceId, organizationId);
  }

  // ── Чтение ────────────────────────────────────────────────────────────────

  async list(organizationId: string, filter: { unmatchedOnly?: boolean; year?: number; month?: number }): Promise<EsfInvoiceDto[]> {
    const where: Prisma.EsfInvoiceWhereInput = { organizationId };
    if (filter.unmatchedOnly) where.settlementId = null;
    if (filter.year && filter.month) {
      where.deliveryDate = {
        gte: new Date(Date.UTC(filter.year, filter.month - 1, 1)),
        lt: new Date(Date.UTC(filter.year, filter.month, 1)),
      };
    }
    const rows = await this.prisma.esfInvoice.findMany({
      where,
      include: INCLUDE,
      orderBy: [{ deliveryDate: 'desc' }, { importedAt: 'desc' }],
    });
    return rows.map((r) => this.toDto(r));
  }

  async findOneDto(id: string, organizationId: string): Promise<EsfInvoiceDto> {
    const row = await this.prisma.esfInvoice.findFirst({ where: { id, organizationId }, include: INCLUDE });
    if (!row) throw new NotFoundException('ЭСФ не найдена');
    return this.toDto(row);
  }

  // ── Внутреннее ────────────────────────────────────────────────────────────

  /**
   * Сначала по ИНН — надёжно. Иначе по наименованию без юридической формы и
   * кавычек; при таком совпадении ИНН дозаписывается в карточку, чтобы дальше
   * партнёр находился по ИНН, а не по имени.
   */
  private async findCounterparty(organizationId: string, inn: string | null, name: string) {
    if (inn && inn !== RETAIL_INN) {
      const byInn = await this.prisma.counterparty.findFirst({
        where: { organizationId, inn },
        select: { id: true },
      });
      if (byInn) return byInn;
    }

    const wanted = normalizeCompanyName(name);
    if (!wanted) return null;

    const all = await this.prisma.counterparty.findMany({
      where: { organizationId },
      select: { id: true, name: true, inn: true },
    });
    const byName = all.filter((c) => normalizeCompanyName(c.name) === wanted);
    if (byName.length !== 1) return null;

    const found = byName[0]!;
    if (inn && inn !== RETAIL_INN && !found.inn) {
      await this.prisma.counterparty.update({ where: { id: found.id }, data: { inn } });
      this.logger.log(`Партнёру «${found.name}» дозаписан ИНН ${inn} из ЭСФ`);
    }
    return { id: found.id };
  }

  private async candidatesFor(organizationId: string, counterpartyId: string): Promise<SettlementCandidate[]> {
    const settlements = await this.prisma.settlement.findMany({
      where: { organizationId, counterpartyId },
      select: {
        id: true,
        year: true,
        month: true,
        amount: true,
        documents: { select: { number: true } },
        esfInvoices: { select: { id: true } },
      },
    });
    return settlements.map((s) => ({
      id: s.id,
      year: s.year,
      month: s.month,
      amount: s.amount.toNumber(),
      documentNumbers: s.documents.map((d) => d.number).filter((n): n is string => !!n),
      hasEsf: s.esfInvoices.length > 0,
    }));
  }

  private async attachToSettlement(
    settlementId: string,
    fileAssetId: string | null,
    number: string | null,
    issuedOn: string,
    status: EsfStatus,
    userId: string,
  ) {
    if (fileAssetId) {
      await this.prisma.fileAsset.update({ where: { id: fileAssetId }, data: { settlementId } });
    }
    const step = await this.esfStep(settlementId);
    if (!step) return;

    if (statusClosesStep(status)) {
      await this.prisma.settlementStep.update({
        where: { id: step.id },
        data: {
          doneAt: step.doneAt ?? new Date(),
          doneById: step.doneById ?? userId,
          note: this.stepNote(number, issuedOn),
          ...(fileAssetId ? { fileAssetId } : {}),
        },
      });
    } else {
      await this.prisma.settlementStep.update({
        where: { id: step.id },
        data: { note: `ЭСФ ${number ?? ''} — ${this.statusLabel(status)} на портале`, ...(fileAssetId ? { fileAssetId } : {}) },
      });
    }
    await this.refreshClosedAt(settlementId);
  }

  private esfStep(settlementId: string) {
    return this.prisma.settlementStep.findUnique({
      where: { settlementId_type: { settlementId, type: SettlementStepType.ISSUE_ESF } },
    });
  }

  private async refreshClosedAt(settlementId: string) {
    const open = await this.prisma.settlementStep.count({ where: { settlementId, doneAt: null } });
    await this.prisma.settlement.update({
      where: { id: settlementId },
      data: { closedAt: open === 0 ? new Date() : null },
    });
  }

  private stepNote(number: string | null, issuedOn: string): string {
    return `ЭСФ № ${number ?? '—'}${issuedOn ? ` от ${issuedOn}` : ''}`;
  }

  private statusLabel(status: EsfStatus): string {
    const labels: Record<EsfStatus, string> = {
      NEW: 'черновик', SENT: 'отправлена', ACCEPTED: 'принята',
      REVOKED: 'отозвана', REJECTED: 'отклонена', UNKNOWN: 'статус неизвестен',
    };
    return labels[status];
  }

  private formatDate(d: Date): string {
    return `${String(d.getUTCDate()).padStart(2, '0')}.${String(d.getUTCMonth() + 1).padStart(2, '0')}.${d.getUTCFullYear()}`;
  }

  private toDto(r: Row): EsfInvoiceDto {
    return {
      id: r.id,
      uuid: r.uuid,
      number: r.number,
      status: r.status,
      deliveryDate: r.deliveryDate?.toISOString() ?? null,
      issuedOn: r.issuedOn?.toISOString() ?? null,
      buyerInn: r.buyerInn,
      buyerName: r.buyerName,
      amount: r.amount.toNumber(),
      crmRef: r.crmRef,
      note: r.note,
      counterpartyId: r.counterpartyId,
      counterpartyName: r.counterparty?.name ?? null,
      settlementId: r.settlementId,
      fileAssetId: r.fileAssetId,
      matchNote: r.matchNote,
      importedAt: r.importedAt.toISOString(),
    };
  }
}
