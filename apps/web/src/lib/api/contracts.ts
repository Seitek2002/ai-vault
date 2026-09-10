import { api } from './client';

export interface Contract {
  id: string;
  counterpartyId: string;
  counterpartyName: string;
  documentId: string | null;
  title: string;
  defaultAmount: number;
  vatRate: number;
  currency: string;
  billingDay: number;
  paymentDueDays: number;
  esfRequired: boolean;
  active: boolean;
  startDate: string | null;
  endDate: string | null;
}

export interface ContractFormData {
  counterpartyId: string;
  title: string;
  defaultAmount: number;
  vatRate?: number;
  currency?: string;
  billingDay?: number;
  paymentDueDays?: number;
  esfRequired?: boolean;
  active?: boolean;
  startDate?: string;
  endDate?: string;
  documentId?: string;
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
  create: (dto: ContractFormData) => api.post<Contract>('/contracts', dto),
  update: (id: string, dto: Partial<ContractFormData>) =>
    api.patch<Contract>(`/contracts/${id}`, dto),
  remove: (id: string) => api.delete<void>(`/contracts/${id}`),
};
