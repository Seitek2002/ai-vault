import { api } from './client';

export interface LetterheadDto {
  id: string;
  organizationId: string;
  name: string;
  bodyJson: unknown;
  createdAt: string;
  updatedAt: string;
}

export interface CreateLetterheadRequest {
  name: string;
  bodyJson?: unknown;
}

export interface UpdateLetterheadRequest {
  name?: string;
  bodyJson?: unknown;
}

export const letterheadsApi = {
  list: (search?: string) =>
    api.get<LetterheadDto[]>(`/letterheads${search ? `?search=${encodeURIComponent(search)}` : ''}`),

  get: (id: string) => api.get<LetterheadDto>(`/letterheads/${id}`),

  create: (dto: CreateLetterheadRequest) => api.post<LetterheadDto>('/letterheads', dto),

  update: (id: string, dto: UpdateLetterheadRequest) =>
    api.patch<LetterheadDto>(`/letterheads/${id}`, dto),

  delete: (id: string) => api.delete<void>(`/letterheads/${id}`),
};
