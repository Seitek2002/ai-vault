import { api } from './client';
import type { ContractBillingPeriod } from '@ai-vault/doc-placeholders';
import type { ContractHistoryData } from './contract-history';

export interface ContractAttachment {
  id: string;
  originalName: string;
  size: number;
}

export interface Contract {
  id: string;
  number: string;
  counterpartyId: string;
  counterpartyName: string;
  documentId: string | null;
  contractPdf: ContractAttachment | null;
  ndaPdf: ContractAttachment | null;
  additionalPdfs: ContractAttachment[];
  title: string;
  defaultAmount: number;
  vatRate: number;
  currency: string;
  billingDay: number;
  paymentDueDays: number;
  esfRequired: boolean;
  active: boolean;
  billingPeriod?: ContractBillingPeriod;
  autoRenew?: boolean;
  terminationDate?: string | null;
  terminationPdf?: ContractAttachment | null;
  effectiveEndDate?: string | null;
  startDate: string | null;
  endDate: string | null;
  termValue: number | null;
  termUnit: 'MONTHS' | 'YEARS' | null;
}

export interface ContractFormData {
  number?: string;
  counterpartyId: string;
  title: string;
  defaultAmount: number;
  vatRate?: number;
  currency?: string;
  billingDay?: number;
  paymentDueDays?: number;
  esfRequired?: boolean;
  active?: boolean;
  billingPeriod?: ContractBillingPeriod;
  autoRenew?: boolean;
  terminationDate?: string | null;
  terminationPdfId?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  termValue?: number | null;
  termUnit?: 'MONTHS' | 'YEARS' | null;
  documentId?: string;
  contractPdfId?: string | null;
  ndaPdfId?: string | null;
  additionalPdfIds?: string[];
}

export const contractsApi = {
  list: (params?: { counterpartyId?: string; search?: string; activeOnly?: boolean }) => {
    const q = new URLSearchParams();
    if (params?.counterpartyId) q.set('counterpartyId', params.counterpartyId);
    if (params?.search) q.set('search', params.search);
    if (params?.activeOnly) q.set('activeOnly', 'true');
    const qs = q.toString();
    return api.get<Contract[]>(`/contracts${qs ? `?${qs}` : ''}`);
  },
  get: (id: string) => api.get<Contract>(`/contracts/${id}`),
  history: (id: string) => api.get<ContractHistoryData>(`/contracts/${id}/history`),
  create: (dto: ContractFormData) => api.post<Contract>('/contracts', dto),
  update: (id: string, dto: Partial<ContractFormData>) =>
    api.patch<Contract>(`/contracts/${id}`, dto),
  remove: (id: string) => api.delete<void>(`/contracts/${id}`),
};
