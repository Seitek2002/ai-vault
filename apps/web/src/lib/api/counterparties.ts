import { api } from './client';
import type { CounterpartyDto } from '@ai-vault/types';

export interface CounterpartyFormData {
  name: string;
  inn?: string;
  bin?: string;
  address?: string;
  phone?: string;
  email?: string;
  bankAccount?: string;
  bankName?: string;
  bankBik?: string;
}

export const counterpartiesApi = {
  list: (search?: string) => {
    const q = search ? `?search=${encodeURIComponent(search)}` : '';
    return api.get<CounterpartyDto[]>(`/counterparties${q}`);
  },
  get: (id: string) => api.get<CounterpartyDto>(`/counterparties/${id}`),
  create: (dto: CounterpartyFormData) => api.post<CounterpartyDto>('/counterparties', dto),
  update: (id: string, dto: Partial<CounterpartyFormData>) =>
    api.patch<CounterpartyDto>(`/counterparties/${id}`, dto),
  remove: (id: string) => api.delete<void>(`/counterparties/${id}`),
  quickCreate: (name: string) => api.post<CounterpartyDto>('/counterparties', { name }),
};
