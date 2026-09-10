import { formatAmount } from '@ai-vault/doc-placeholders';
import { api } from './client';

export type SettlementStepType =
  | 'ISSUE_ACT'
  | 'ISSUE_INVOICE'
  | 'SEND'
  | 'ISSUE_ESF'
  | 'RECEIVE_SIGNED'
  | 'RECEIVE_PAYMENT';

export type SettlementStatus = 'closed' | 'overdue' | 'waiting_partner' | 'waiting_us';

export interface SettlementStep {
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

export interface SettlementPayment {
  id: string;
  amount: number;
  paidAt: string;
  reference: string | null;
  fileAssetId: string | null;
}

export interface Settlement {
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
  steps: SettlementStep[];
  payments: SettlementPayment[];
}

export interface SettlementDocument {
  id: string;
  type: string;
  status: string;
  title: string;
  number: string | null;
  updatedAt: string;
}

export interface SettlementFile {
  id: string;
  originalName: string;
  mimeType: string;
  size: number;
  s3Url: string;
  createdAt: string;
}

export interface SettlementDetail extends Settlement {
  documents: SettlementDocument[];
  fileAssets: SettlementFile[];
}

export interface MonthBoard {
  year: number;
  month: number;
  settlements: Settlement[];
  totals: {
    count: number;
    overdue: number;
    toIssue: number;
    waitingSigned: number;
    waitingEsf: number;
    unpaidAmount: number;
  };
}

export interface CompleteStepDto {
  note?: string;
  fileAssetId?: string;
  documentId?: string;
}

export interface CreatePaymentDto {
  amount: number;
  paidAt: string;
  reference?: string;
  fileAssetId?: string;
}

export const settlementsApi = {
  board: (year: number, month: number) =>
    api.get<MonthBoard>(`/settlements?year=${year}&month=${month}`),
  get: (id: string) => api.get<SettlementDetail>(`/settlements/${id}`),
  byCounterparty: (counterpartyId: string) =>
    api.get<Settlement[]>(`/settlements/by-counterparty/${counterpartyId}`),
  generate: (year: number, month: number, contractId?: string) =>
    api.post<{ created: number; skipped: number; settlementIds: string[] }>(
      '/settlements/generate',
      { year, month, ...(contractId ? { contractId } : {}) },
    ),
  update: (id: string, dto: { amount?: number; vatAmount?: number }) =>
    api.patch<SettlementDetail>(`/settlements/${id}`, dto),
  remove: (id: string) => api.delete<void>(`/settlements/${id}`),
  completeStep: (id: string, stepId: string, dto: CompleteStepDto) =>
    api.post<SettlementDetail>(`/settlements/${id}/steps/${stepId}/complete`, dto),
  reopenStep: (id: string, stepId: string) =>
    api.post<SettlementDetail>(`/settlements/${id}/steps/${stepId}/reopen`, {}),
  addPayment: (id: string, dto: CreatePaymentDto) =>
    api.post<SettlementDetail>(`/settlements/${id}/payments`, dto),
  removePayment: (id: string, paymentId: string) =>
    api.delete<SettlementDetail>(`/settlements/${id}/payments/${paymentId}`),
};

export const STEP_LABELS: Record<SettlementStepType, string> = {
  ISSUE_ACT: 'Акт',
  ISSUE_INVOICE: 'Счёт',
  SEND: 'Отправлен',
  ISSUE_ESF: 'ЭСФ',
  RECEIVE_SIGNED: 'Подписан',
  RECEIVE_PAYMENT: 'Оплата',
};

export const STEP_FULL_LABELS: Record<SettlementStepType, string> = {
  ISSUE_ACT: 'Выставить акт',
  ISSUE_INVOICE: 'Выставить счёт',
  SEND: 'Отправить партнёру',
  ISSUE_ESF: 'Выставить ЭСФ',
  RECEIVE_SIGNED: 'Получить подписанный',
  RECEIVE_PAYMENT: 'Подтвердить оплату',
};

export const STEP_ORDER: SettlementStepType[] = [
  'ISSUE_ACT',
  'ISSUE_INVOICE',
  'SEND',
  'ISSUE_ESF',
  'RECEIVE_SIGNED',
  'RECEIVE_PAYMENT',
];

export const MONTH_NAMES = [
  'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
  'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь',
];

export function formatMoney(value: number, currency = 'KGS'): string {
  // Тот же форматтер, что печатается в документах — суммы на экране и в акте
  // не должны выглядеть по-разному.
  const formatted = formatAmount(value);
  return currency === 'KGS' ? `${formatted} сом` : `${formatted} ${currency}`;
}

/** «15 окт» — в таблице дашборда нужен короткий срок, без года. */
export function formatDueDate(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  const months = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
  return `${d.getUTCDate()} ${months[d.getUTCMonth()] ?? ''}`;
}
