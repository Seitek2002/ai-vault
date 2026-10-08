import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { deriveStatus } from '../settlements/settlement-steps.util';

const fileSelect = { id: true, organizationId: true, originalName: true, mimeType: true, size: true } as const;
const documentSelect = {
  id: true, organizationId: true, type: true, status: true, title: true, number: true,
  isArchived: true, createdAt: true, fileAssets: { select: fileSelect },
} as const;
const documentWithScansSelect = { ...documentSelect, scans: { select: documentSelect } } as const;
const periodSelect = {
  id: true, organizationId: true, contractId: true, year: true, month: true, sequence: true,
  contract: { select: { number: true } },
} as const;
const invoiceSelect = {
  id: true, organizationId: true, uuid: true, number: true, status: true, amount: true,
  issuedOn: true, deliveryDate: true, note: true, fileAsset: { select: fileSelect },
  settlement: { select: periodSelect },
  settlementLinks: { select: { settlement: { select: periodSelect } } },
} as const;
const historySelect = {
  id: true, year: true, month: true, sequence: true, label: true, amount: true,
  currency: true, closedAt: true, deletedAt: true,
  steps: { orderBy: { order: 'asc' }, select: {
    type: true, order: true, dueDate: true, doneAt: true, note: true, evidenceUrl: true,
    doneBy: { select: { name: true } }, fileAsset: { select: fileSelect },
    document: { select: documentWithScansSelect },
  } },
  documents: { select: documentWithScansSelect },
  payments: { orderBy: { paidAt: 'desc' }, select: {
    id: true, organizationId: true, amount: true, paidAt: true, reference: true,
    fileAsset: { select: fileSelect },
  } },
  fileAssets: { select: fileSelect },
  esfInvoices: { select: invoiceSelect },
  esfLinks: { select: { invoice: { select: invoiceSelect } } },
} satisfies Prisma.SettlementSelect;

type File = Prisma.FileAssetGetPayload<{ select: typeof fileSelect }>;
type Doc = Prisma.DocumentGetPayload<{ select: typeof documentSelect }>;
type Invoice = Prisma.EsfInvoiceGetPayload<{ select: typeof invoiceSelect }>;
const unique = <T extends { id: string }>(items: T[]) => [...new Map(items.map((item) => [item.id, item])).values()];

@Injectable()
export class ContractHistoryService {
  constructor(private readonly prisma: PrismaService) {}

  async find(id: string, organizationId: string) {
    const contract = await this.prisma.contract.findFirst({ where: { id, organizationId }, select: { id: true } });
    if (!contract) throw new NotFoundException('Договор не найден');
    // Metadata only: document bodies and private storage keys never enter this response.
    const rows = await this.prisma.settlement.findMany({
      where: { contractId: id, organizationId },
      orderBy: [{ year: 'desc' }, { month: 'desc' }, { sequence: 'asc' }], select: historySelect,
    });
    const file = (value: File | null) => value?.organizationId === organizationId
      ? { id: value.id, originalName: value.originalName, mimeType: value.mimeType, size: value.size } : null;
    const doc = (value: Doc) => ({
      id: value.id, type: value.type, status: value.status, title: value.title, number: value.number,
      isArchived: value.isArchived, createdAt: value.createdAt, files: value.fileAssets.map(file).filter((f) => f !== null),
    });
    const invoice = (value: Invoice) => ({
      id: value.id, uuid: value.uuid, number: value.number, status: value.status,
      amount: value.amount.toNumber(), issuedOn: value.issuedOn, deliveryDate: value.deliveryDate,
      note: value.note, file: file(value.fileAsset),
      periods: unique([...(value.settlement ? [value.settlement] : []), ...value.settlementLinks.map((link) => link.settlement)])
        .filter((period) => period.organizationId === organizationId)
        .map((period) => ({ id: period.id, contractId: period.contractId, contractNumber: period.contract.number,
          year: period.year, month: period.month, sequence: period.sequence })),
    });
    const totals = new Map<string, { currency: string; billed: Prisma.Decimal; paid: Prisma.Decimal; due: Prisma.Decimal; overpaid: Prisma.Decimal }>();
    const settlements = rows.map((row) => {
      const payments = row.payments.filter((payment) => payment.organizationId === organizationId);
      const paid = payments.reduce((sum, payment) => sum.add(payment.amount), new Prisma.Decimal(0));
      const due = Prisma.Decimal.max(row.amount.sub(paid), 0);
      const overpaid = Prisma.Decimal.max(paid.sub(row.amount), 0);
      const total = totals.get(row.currency) ?? { currency: row.currency, billed: new Prisma.Decimal(0), paid: new Prisma.Decimal(0), due: new Prisma.Decimal(0), overpaid: new Prisma.Decimal(0) };
      if (!row.deletedAt) {
        total.billed = total.billed.add(row.amount); total.paid = total.paid.add(paid);
        // Do not offset another settlement's debt with this settlement's overpayment.
        total.due = total.due.add(due); total.overpaid = total.overpaid.add(overpaid);
        totals.set(row.currency, total);
      }
      return {
        id: row.id, year: row.year, month: row.month, sequence: row.sequence, label: row.label,
        amount: row.amount.toNumber(), currency: row.currency, closedAt: row.closedAt, deletedAt: row.deletedAt,
        paidAmount: paid.toNumber(), dueAmount: due.toNumber(), overpaidAmount: overpaid.toNumber(),
        status: deriveStatus(row.steps),
        steps: row.steps.map((step) => ({ type: step.type, dueDate: step.dueDate, doneAt: step.doneAt,
          note: step.note, evidenceUrl: step.evidenceUrl, doneByName: step.doneBy?.name ?? null,
          file: file(step.fileAsset), document: step.document?.organizationId === organizationId ? doc(step.document) : null })),
        documents: unique([...row.documents, ...row.documents.flatMap((d) => d.scans),
          ...row.steps.flatMap((step) => step.document ? [step.document, ...step.document.scans] : [])])
          .filter((d) => d.organizationId === organizationId).map(doc),
        files: row.fileAssets.map(file).filter((f) => f !== null),
        payments: payments.map((payment) => ({ id: payment.id, amount: payment.amount.toNumber(),
          paidAt: payment.paidAt, reference: payment.reference, file: file(payment.fileAsset) })),
        esfInvoices: unique([...row.esfInvoices, ...row.esfLinks.map((link) => link.invoice)])
          .filter((i) => i.organizationId === organizationId).map(invoice),
      };
    });
    return { settlements, totals: [...totals.values()].map((t) => ({ currency: t.currency,
      billed: t.billed.toNumber(), paid: t.paid.toNumber(), due: t.due.toNumber(), overpaid: t.overpaid.toNumber() })) };
  }
}
