import * as argon2 from 'argon2';
import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { EsfStatus, Prisma, SettlementStepType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { open as openSecret } from '../common/secret-box';
import { EsfDraftClient } from './esf-draft.client';
import { EsfPortalClient, EsfPortalError, type EsfListRow } from './esf-portal.client';
import { EsfPdfService } from './esf-pdf';
import { EsfLinksService, invoiceSettlementIds, MANUAL_ESF_DETACH_NOTE } from './esf-links.service';
import { esfLineAmounts, esfServiceForPeriod } from '@ai-vault/doc-placeholders';
import type { CreateEsfDraftDto } from './dto/esf.dto';
import {
  RETAIL_INN,
  esfAccountingRef,
  mapPortalStatus,
  matchSettlement,
  normalizeCompanyName,
  parsePortalAmount,
  parsePortalDate,
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
  settlementIds: string[];
  settlements: { id: string; contractId: string; contractNumber: string; contractTitle: string; counterpartyId: string;
    year: number; month: number; sequence: number; amount: number; currency: string }[];
  fileAssetId: string | null;
  matchNote: string | null;
  hiddenAt: string | null;
  importedAt: string;
}

const INCLUDE = {
  counterparty: { select: { id: true, name: true } },
  settlementLinks: { include: { settlement: { select: {
    id: true, contractId: true, counterpartyId: true, year: true, month: true, sequence: true, amount: true, currency: true,
    contract: { select: { number: true, title: true } },
  } } } },
} satisfies Prisma.EsfInvoiceInclude;

type Row = Prisma.EsfInvoiceGetPayload<{ include: typeof INCLUDE }>;

const MONTH_NAMES_RU = [
  'январь', 'февраль', 'март', 'апрель', 'май', 'июнь',
  'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь',
];

@Injectable()
export class EsfService {
  private readonly logger = new Logger(EsfService.name);
  private readonly creatingDrafts = new Set<string>();

  constructor(
    private prisma: PrismaService,
    private storage: StorageService,
    private portal: EsfPortalClient,
    private draft: EsfDraftClient,
    private pdf: EsfPdfService,
    private links: EsfLinksService,
  ) {}

  // ── Черновик на портале ───────────────────────────────────────────────────

  /**
   * Создаёт в кабинете черновик ЭСФ для расчёта: копия последней отправленной
   * ЭСФ этого партнёра с новой датой, суммой и номером учётной системы.
   * Подписать и отправить черновик может только человек — на портале.
   */
  private async draftContext(organizationId: string, settlementId: string) {
    const settings = await this.prisma.companySettings.findUnique({ where: { organizationId } });
    if (!settings?.esfLogin || !settings.esfPasswordEnc) {
      throw new BadRequestException('Кабинет ЭСФ не подключён — укажите логин и пароль в настройках');
    }

    const settlement = await this.prisma.settlement.findFirst({
      where: { id: settlementId, organizationId },
      include: { contract: true, counterparty: true, steps: true, documents: true },
    });
    if (!settlement) throw new NotFoundException('Расчёт не найден');
    const step = settlement.steps.find((s) => s.type === SettlementStepType.ISSUE_ESF);
    if (!step) throw new BadRequestException('В этом расчёте нет шага «Выставить ЭСФ»');
    if (step.doneAt) throw new BadRequestException('Шаг «Выставить ЭСФ» уже закрыт');
    const actStep = settlement.steps.find((s) => s.type === SettlementStepType.ISSUE_ACT);
    const actPdf = actStep?.fileAssetId
      ? await this.prisma.fileAsset.findFirst({
        where: { id: actStep.fileAssetId, organizationId, settlementId },
        select: { mimeType: true, size: true },
      })
      : null;
    if (!actPdf || actPdf.mimeType !== 'application/pdf' || actPdf.size <= 0) {
      throw new BadRequestException('Сначала прикрепите PDF акта к этому расчёту в шаге «Выставить акт», затем создайте ЭСФ.');
    }
    const existing = await this.prisma.esfInvoice.findFirst({ where: {
      organizationId, OR: [{ settlementId }, { settlementLinks: { some: { settlementId } } }],
    } });
    if (existing) {
      throw new BadRequestException(`К расчёту уже привязана ЭСФ ${existing.number ?? '(черновик)'}`);
    }

    // Образец — последняя отправленная ЭСФ по ЭТОМУ ЖЕ договору: у партнёра
    // может быть несколько договоров с разными услугами, и копировать нужно
    // ЭСФ своей услуги. Если по договору ЭСФ ещё не было — берём любую ЭСФ партнёра.
    const sentStatuses: Prisma.EnumEsfStatusFilter = { in: [EsfStatus.SENT, EsfStatus.ACCEPTED] };
    const sameCompany = { organizationId, counterpartyId: settlement.counterpartyId, status: sentStatuses };
    const sameContract = { ...sameCompany, OR: [{ settlement: { contractId: settlement.contractId } },
      { settlementLinks: { some: { settlement: { contractId: settlement.contractId } } } }] };
    let source = null;
    // A matching total avoids choosing a consolidated multi-month invoice as
    // the regular monthly service breakdown when a matching example exists.
    for (const where of [{ ...sameContract, amount: settlement.amount }, { ...sameCompany, amount: settlement.amount },
      sameContract, sameCompany]) {
      source = await this.prisma.esfInvoice.findFirst({ where, orderBy: [{ issuedOn: 'desc' }, { importedAt: 'desc' }] });
      if (source) break;
    }
    if (!source) {
      throw new BadRequestException(
        `У партнёра «${settlement.counterparty.name}» нет ни одной отправленной ЭСФ — первую выставьте на портале вручную, дальше Vault будет её копировать`,
      );
    }

    return { settings, settlement, source };
  }

  async draftPreview(organizationId: string, settlementId: string) {
    const { settings, settlement, source } = await this.draftContext(organizationId, settlementId);
    const template = await this.draft.getTemplate(settings.esfLogin!, openSecret(settings.esfPasswordEnc!), source.uuid)
      .catch(error => { if (error instanceof EsfPortalError) throw new BadRequestException(error.message); throw error; });
    const lines = template.lines.map(line => ({ ...line, name: esfServiceForPeriod(line.name, settlement.year, settlement.month) }));
    if (lines.length === 1) {
      const line = lines[0]!;
      const taxFactor = line.priceIncludesTaxes ? 1 : 1 + (line.vatRate + line.salesTaxRate) / 100;
      const price = Number((settlement.amount.toNumber() / (line.quantity * taxFactor)).toFixed(5));
      const adjusted = { ...line, price };
      if (Math.round(esfLineAmounts(adjusted).total * 100) === Math.round(settlement.amount.toNumber() * 100)) lines[0] = adjusted;
    }
    return { ...template, lines, sourceUuid: source.uuid, sourceNumber: source.number,
      amount: settlement.amount.toNumber(), currency: settlement.currency,
      period: `${MONTH_NAMES_RU[settlement.month - 1]} ${settlement.year}`, crmRef: esfAccountingRef(settlement.id) };
  }

  async createDraft(organizationId: string, userId: string, settlementId: string, dto?: CreateEsfDraftDto): Promise<EsfInvoiceDto> {
    const key = `${organizationId}:${settlementId}`;
    if (this.creatingDrafts.has(key)) throw new BadRequestException('Черновик этого расчёта уже создаётся. Дождитесь результата.');
    this.creatingDrafts.add(key);
    try {
      return await this.createReviewedDraft(organizationId, userId, settlementId, dto);
    } finally { this.creatingDrafts.delete(key); }
  }

  private async createReviewedDraft(organizationId: string, userId: string, settlementId: string, dto?: CreateEsfDraftDto): Promise<EsfInvoiceDto> {
    const { settings, settlement, source } = await this.draftContext(organizationId, settlementId);
    if (!dto?.lines?.length || !dto.sourceSignature) throw new BadRequestException('Сначала загрузите и проверьте строки услуг ЭСФ.');
    if (dto.sourceUuid !== source.uuid) throw new BadRequestException('ЭСФ-образец изменился. Загрузите строки заново и проверьте их.');

    // Стабильный номер ErkinAI.Docs: не зависит от номера акта или ЭСФ-образца.
    const crmRef = esfAccountingRef(settlement.id);

    // Дата поставки — конец месяца, но не позже сегодня.
    const periodEnd = new Date(Date.UTC(settlement.year, settlement.month, 0));
    const today = new Date();
    const delivery = periodEnd > today ? today : periodEnd;
    const deliveryDate = `${String(delivery.getUTCDate()).padStart(2, '0')}-${String(delivery.getUTCMonth() + 1).padStart(2, '0')}-${delivery.getUTCFullYear()}`;

    const monthName = MONTH_NAMES_RU[settlement.month - 1] ?? String(settlement.month);
    const note = `${settlement.contract.title} — ${monthName} ${settlement.year}`;

    const { uuid } = await this.draft.createByCopy({
      login: settings.esfLogin!,
      password: openSecret(settings.esfPasswordEnc!),
      sourceUuid: source.uuid,
      amount: settlement.amount.toNumber(),
      deliveryDate,
      crmRef,
      note,
      sourceSignature: dto.sourceSignature,
      lines: dto.lines,
    }).catch(error => { if (error instanceof EsfPortalError) throw new BadRequestException(error.message); throw error; });

    // Подтягиваем черновик как обычную ЭСФ и привязываем к расчёту.
    await this.sync(organizationId, userId);
    const invoice = await this.prisma.esfInvoice.findFirst({ where: { organizationId, uuid }, include: { settlementLinks: true } });
    if (!invoice) throw new BadRequestException('Черновик создан на портале, но синхронизация его не нашла — нажмите «ЭСФ» на дашборде');
    if (!invoiceSettlementIds(invoice).includes(settlementId)) {
      return this.attach(organizationId, userId, invoice.id, settlementId);
    }
    return this.findOneDto(invoice.id, organizationId);
  }

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
          select: { id: true, uuid: true, status: true, settlementId: true, hiddenAt: true, fileAssetId: true,
            settlementLinks: { select: { settlementId: true } } },
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

    const invoice = await this.prisma.esfInvoice.create({
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
        settlementId: null,
        fileAssetId: fileAsset.id,
        matchNote,
      },
    });

    if (settlementId) {
      await this.links.attach(organizationId, userId, invoice.id, [settlementId]);
      return 'matched';
    }
    return 'unmatched';
  }

  /** Статус на портале меняется (Отправлен → Принят → иногда Отозван). Ведём его в ногу. */
  private async refreshExisting(
    existing: { id: string; uuid: string; status: EsfStatus; settlementId: string | null; hiddenAt: Date | null; fileAssetId: string | null;
      settlementLinks?: { settlementId: string }[] },
    row: EsfListRow,
    organizationId: string,
    userId: string,
  ): Promise<'rematched' | 'status' | false> {
    const status = mapPortalStatus(row.status);
    const changed = status !== existing.status;
    if (changed) await this.links.refreshStatus(organizationId, existing.id, status, row.number, parsePortalDate(row.issuedOn), row.status, userId);

    // Без расчёта — пробуем снова: партнёру могли проставить ИНН, расчёт
    // могли сформировать позже. Иначе ЭСФ застряла бы «без расчёта» навсегда.
    if (!invoiceSettlementIds(existing).length && !existing.hiddenAt && (await this.rematch(existing.id, organizationId, userId))) {
      return 'rematched';
    }

    return changed ? 'status' : false;
  }

  /** Повторное сопоставление уже импортированной ЭСФ. true — привязалась. */
  private async rematch(invoiceId: string, organizationId: string, userId: string): Promise<boolean> {
    const inv = await this.prisma.esfInvoice.findFirst({ where: { id: invoiceId, organizationId }, include: { settlementLinks: true } });
    if (!inv || invoiceSettlementIds(inv).length || inv.buyerInn === RETAIL_INN || inv.matchNote === MANUAL_ESF_DETACH_NOTE) return false;

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
        matchNote: note,
      },
    });
    if (result.kind !== 'matched') return false;

    await this.links.attach(organizationId, userId, inv.id, [result.settlementId]);
    return true;
  }

  // ── Ручная привязка ───────────────────────────────────────────────────────

  async attach(organizationId: string, userId: string, invoiceId: string, settlementId: string): Promise<EsfInvoiceDto> {
    await this.links.attach(organizationId, userId, invoiceId, [settlementId], false);
    return this.findOneDto(invoiceId, organizationId);
  }

  async attachMany(organizationId: string, userId: string, invoiceId: string, settlementIds: string[]): Promise<EsfInvoiceDto> {
    await this.links.attach(organizationId, userId, invoiceId, settlementIds);
    return this.findOneDto(invoiceId, organizationId);
  }

  async detach(organizationId: string, invoiceId: string, settlementId?: string): Promise<EsfInvoiceDto> {
    await this.links.detach(organizationId, invoiceId, settlementId);
    return this.findOneDto(invoiceId, organizationId);
  }

  /**
   * Скрытые ЭСФ закрыты PIN-кодом из настроек: без него список не отдаём и
   * вернуть из скрытых нельзя. Пока PIN не задан — доступ свободный.
   */
  async assertHiddenPin(organizationId: string, pin: string | undefined): Promise<void> {
    const settings = await this.prisma.companySettings.findUnique({
      where: { organizationId },
      select: { esfHiddenPinHash: true },
    });
    if (!settings?.esfHiddenPinHash) return;
    if (!pin || !(await argon2.verify(settings.esfHiddenPinHash, pin))) {
      throw new ForbiddenException('Неверный код доступа к скрытым ЭСФ');
    }
  }

  /** Сколько скрыто — без PIN, чтобы показать ссылку «Скрытые (N)». */
  hiddenCount(organizationId: string): Promise<number> {
    return this.prisma.esfInvoice.count({ where: { organizationId, hiddenAt: { not: null } } });
  }

  /** Убрать из «без расчёта»: чужая, розничная и т.п. Привязанную скрывать незачем. */
  async setHidden(organizationId: string, invoiceId: string, hidden: boolean): Promise<EsfInvoiceDto> {
    const invoice = await this.prisma.esfInvoice.findFirst({ where: { id: invoiceId, organizationId }, include: { settlementLinks: true } });
    if (!invoice) throw new NotFoundException('ЭСФ не найдена');
    if (hidden && invoiceSettlementIds(invoice).length > 0) throw new BadRequestException('ЭСФ привязана к расчёту — сначала отвяжите');
    await this.prisma.esfInvoice.update({
      where: { id: invoiceId },
      data: { hiddenAt: hidden ? new Date() : null },
    });
    return this.findOneDto(invoiceId, organizationId);
  }

  // ── Чтение ────────────────────────────────────────────────────────────────

  async list(
    organizationId: string,
    filter: { unmatchedOnly?: boolean; hiddenOnly?: boolean; year?: number; month?: number },
  ): Promise<EsfInvoiceDto[]> {
    const where: Prisma.EsfInvoiceWhereInput = { organizationId };
    if (filter.hiddenOnly) where.hiddenAt = { not: null };
    else if (filter.unmatchedOnly) Object.assign(where, { settlementId: null, settlementLinks: { none: {} }, hiddenAt: null });
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
        sequence: true,
        label: true,
        contract: { select: { title: true } },
        documents: { select: { number: true } },
        esfInvoices: { select: { id: true } },
        esfLinks: { select: { invoiceId: true } },
      },
    });
    return settlements.map((s) => ({
      id: s.id,
      year: s.year,
      month: s.month,
      amount: s.amount.toNumber(),
      contractTitle: `${s.contract.title} · Комплект №${s.sequence}${s.label ? ` · ${s.label}` : ''}`,
      documentNumbers: s.documents.map((d) => d.number).filter((n): n is string => !!n),
      hasEsf: s.esfInvoices.length > 0 || s.esfLinks.length > 0,
    }));
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
      settlementIds: invoiceSettlementIds(r),
      settlements: r.settlementLinks.map(({ settlement: s }) => ({
        id: s.id, contractId: s.contractId, counterpartyId: s.counterpartyId,
        contractNumber: s.contract.number, contractTitle: s.contract.title,
        year: s.year, month: s.month, sequence: s.sequence, amount: s.amount.toNumber(), currency: s.currency,
      })).sort((a, b) => a.year - b.year || a.month - b.month || a.sequence - b.sequence),
      fileAssetId: r.fileAssetId,
      matchNote: r.matchNote,
      hiddenAt: r.hiddenAt?.toISOString() ?? null,
      importedAt: r.importedAt.toISOString(),
    };
  }
}
