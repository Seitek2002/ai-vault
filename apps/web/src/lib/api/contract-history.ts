import type { SettlementStatus, SettlementStepType } from './settlements';
import type { EsfStatus } from './esf';

export interface HistoryFile { id: string; originalName: string; mimeType: string; size: number }
export interface HistoryDocument {
  id: string; type: string; status: string; title: string; number: string | null;
  isArchived: boolean; createdAt: string; files: HistoryFile[];
}
export interface HistorySettlement {
  id: string; year: number; month: number; sequence: number; label: string | null;
  amount: number; currency: string; closedAt: string | null;
  deletedAt?: string | null;
  paidAmount: number; dueAmount: number; overpaidAmount: number; status: SettlementStatus;
  steps: { type: SettlementStepType; dueDate: string | null; doneAt: string | null;
    note: string | null; evidenceUrl: string | null; doneByName: string | null;
    file: HistoryFile | null; document: HistoryDocument | null }[];
  documents: HistoryDocument[];
  files: HistoryFile[];
  payments: { id: string; amount: number; paidAt: string; reference: string | null; file: HistoryFile | null }[];
  esfInvoices: { id: string; uuid: string; number: string | null; status: EsfStatus; amount: number;
    issuedOn: string | null; deliveryDate: string | null; note: string | null; file: HistoryFile | null;
    periods: { id: string; contractId: string; contractNumber: string; year: number; month: number; sequence: number }[] }[];
}
export interface ContractHistoryData {
  settlements: HistorySettlement[];
  totals: { currency: string; billed: number; paid: number; due: number; overpaid: number }[];
}
