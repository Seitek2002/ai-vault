import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { EsfStatus, Prisma, SettlementStepType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { statusClosesStep } from './esf-matching';

const LINKS = { settlementLinks: { select: { settlementId: true } } } as const;
type Invoice = Prisma.EsfInvoiceGetPayload<{ include: typeof LINKS }>;

export function hasManualEsfEvidence(
  step: { doneAt: Date | null; evidenceUrl: string | null; fileAssetId: string | null },
  invoiceFileAssetId: string | null,
): boolean {
  return !!step.doneAt && !!(step.evidenceUrl || (step.fileAssetId && step.fileAssetId !== invoiceFileAssetId));
}

export function invoiceSettlementIds(invoice: { settlementId: string | null; settlementLinks?: { settlementId: string }[] }): string[] {
  return [...new Set([...(invoice.settlementId ? [invoice.settlementId] : []),
    ...(invoice.settlementLinks ?? []).map((link) => link.settlementId)])];
}

/** All links and checklist evidence change together. Locks also protect concurrent invoices. */
@Injectable()
export class EsfLinksService {
  constructor(private prisma: PrismaService) {}

  async attach(organizationId: string, userId: string, invoiceId: string, requested: string[], replace = true): Promise<void> {
    if (!Array.isArray(requested) || !requested.length || requested.length > 120 || requested.some((id) => typeof id !== 'string' || !id.trim())
      || new Set(requested).size !== requested.length) {
      throw new BadRequestException('Выберите от 1 до 120 разных расчётов.');
    }
    try {
      await this.prisma.$transaction(async (tx) => {
        const invoice = await this.lockInvoice(tx, organizationId, invoiceId);
        const before = invoiceSettlementIds(invoice);
        const ids = replace ? requested : [...new Set([...before, ...requested])];
        if (ids.length > 120) throw new BadRequestException('Одна ЭСФ может покрывать не более 120 расчётов.');
        await this.lockSettlements(tx, organizationId, [...before, ...ids]);
        const settlements = await tx.settlement.findMany({ where: { organizationId, id: { in: ids } } });
        if (settlements.length !== ids.length) throw new NotFoundException('Некоторые расчёты не найдены');
        if (new Set(settlements.map((s) => s.counterpartyId)).size !== 1) {
          throw new BadRequestException('Одна ЭСФ может покрывать несколько месяцев только одной компании.');
        }
        if (new Set(settlements.map((s) => s.currency)).size !== 1) {
          throw new BadRequestException('Выберите расчёты в одной валюте.');
        }
        const taken = await tx.esfInvoice.findFirst({ where: {
          organizationId, id: { not: invoiceId },
          OR: [{ settlementId: { in: ids } }, { settlementLinks: { some: { settlementId: { in: ids } } } }],
        }, select: { number: true } });
        if (taken) throw new BadRequestException(`На одном из расчётов уже есть ЭСФ ${taken.number ?? '(без номера)'}`);
        await this.reconcile(tx, invoice, ids, userId, settlements[0]!.counterpartyId);
      }, { maxWait: 15000, timeout: 30000 });
    } catch (error) {
      if ((error as { code?: string }).code === 'P2002') {
        throw new BadRequestException('Один из расчётов уже занят другой ЭСФ. Обновите список.');
      }
      if ((error as { code?: string }).code === 'P2003') {
        throw new BadRequestException('Расчёт изменён или удалён. Обновите список.');
      }
      throw error;
    }
  }

  async detach(organizationId: string, invoiceId: string, settlementId?: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const invoice = await this.lockInvoice(tx, organizationId, invoiceId);
      const before = invoiceSettlementIds(invoice);
      if (settlementId && !before.includes(settlementId)) throw new NotFoundException('ЭСФ не привязана к этому расчёту');
      await this.lockSettlements(tx, organizationId, before);
      await this.reconcile(tx, invoice, settlementId ? before.filter((id) => id !== settlementId) : []);
    }, { maxWait: 15000, timeout: 30000 });
  }

  async refreshStatus(org: string, id: string, status: EsfStatus, number: string, issuedOn: Date | null, portalStatus: string, userId: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const invoice = await this.lockInvoice(tx, org, id);
      const ids = invoiceSettlementIds(invoice);
      await this.lockSettlements(tx, org, ids);
      await tx.esfInvoice.update({ where: { id }, data: { status, ...(number ? { number } : {}), issuedOn } });
      for (const settlementId of ids) {
        const step = await this.step(tx, settlementId);
        if (!step || hasManualEsfEvidence(step, invoice.fileAssetId)) continue;
        if (statusClosesStep(status) && !step.doneAt) {
          const date = issuedOn?.toLocaleDateString('ru-RU', { timeZone: 'UTC' });
          await tx.settlementStep.update({ where: { id: step.id }, data: {
            doneAt: new Date(), doneById: userId, evidenceUrl: null, fileAssetId: invoice.fileAssetId,
            note: `ЭСФ № ${number || invoice.number || '—'}${date ? ` от ${date}` : ''}`,
          } });
        } else if (!statusClosesStep(status) && step.doneAt) {
          await tx.settlementStep.update({ where: { id: step.id }, data: {
            doneAt: null, doneById: null, note: `ЭСФ ${number || invoice.number || '—'} — ${portalStatus.toLowerCase()} на портале`,
          } });
        }
      }
      await this.refreshClosedAt(tx, ids);
    }, { maxWait: 15000, timeout: 30000 });
  }

  private async lockInvoice(tx: Prisma.TransactionClient, organizationId: string, id: string): Promise<Invoice> {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`esf-invoice:${organizationId}:${id}`}))`;
    const invoice = await tx.esfInvoice.findFirst({ where: { id, organizationId }, include: LINKS });
    if (!invoice) throw new NotFoundException('ЭСФ не найдена');
    return invoice;
  }

  private async lockSettlements(tx: Prisma.TransactionClient, org: string, ids: string[]) {
    for (const id of [...new Set(ids)].sort()) {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`esf-settlement:${org}:${id}`}))`;
    }
  }

  private async reconcile(tx: Prisma.TransactionClient, invoice: Invoice, ids: string[], userId?: string, counterpartyId?: string) {
    const before = invoiceSettlementIds(invoice);
    for (const id of before.filter((previous) => !ids.includes(previous))) {
      const step = await this.step(tx, id);
      if (step && !hasManualEsfEvidence(step, invoice.fileAssetId) && step.fileAssetId === invoice.fileAssetId) {
        await tx.settlementStep.update({ where: { id: step.id }, data: { doneAt: null, doneById: null, fileAssetId: null, note: null } });
      }
    }
    await tx.esfSettlementLink.deleteMany({ where: { invoiceId: invoice.id, settlementId: { notIn: ids } } });
    const linked = new Set(invoice.settlementLinks.map((link) => link.settlementId));
    const added = ids.filter((id) => !linked.has(id));
    if (added.length) await tx.esfSettlementLink.createMany({ data: added.map((settlementId) => ({ invoiceId: invoice.id, settlementId })) });
    await tx.esfInvoice.update({ where: { id: invoice.id }, data: {
      settlementId: ids[0] ?? null, matchNote: ids.length ? null : 'Отвязана вручную',
      ...(userId ? { hiddenAt: null, counterpartyId: counterpartyId ?? invoice.counterpartyId } : {}),
    } });
    if (invoice.fileAssetId) {
      await tx.fileAsset.update({ where: { id: invoice.fileAssetId }, data: { settlementId: ids[0] ?? null } });
    }
    if (userId) for (const id of ids) {
      const step = await this.step(tx, id);
      if (!step || hasManualEsfEvidence(step, invoice.fileAssetId)) continue;
      const date = invoice.issuedOn?.toLocaleDateString('ru-RU', { timeZone: 'UTC' });
      const note = `ЭСФ № ${invoice.number ?? '—'}${date ? ` от ${date}` : ''}`;
      await tx.settlementStep.update({ where: { id: step.id }, data: statusClosesStep(invoice.status) ? {
        doneAt: step.doneAt ?? new Date(), doneById: step.doneById ?? userId,
        note, evidenceUrl: null, fileAssetId: invoice.fileAssetId,
      } : { note: `${note} — ещё не отправлена на портале`, ...(invoice.fileAssetId ? { fileAssetId: invoice.fileAssetId } : {}) } });
    }
    await this.refreshClosedAt(tx, [...before, ...ids]);
  }

  private async refreshClosedAt(tx: Prisma.TransactionClient, ids: string[]) {
    for (const id of [...new Set(ids)]) {
      const open = await tx.settlementStep.count({ where: { settlementId: id, doneAt: null } });
      await tx.settlement.update({ where: { id }, data: { closedAt: open === 0 ? new Date() : null } });
    }
  }

  private step(tx: Prisma.TransactionClient, settlementId: string) {
    return tx.settlementStep.findUnique({ where: { settlementId_type: { settlementId, type: SettlementStepType.ISSUE_ESF } } });
  }
}
