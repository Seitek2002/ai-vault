import { api } from './client';
import type {
  DocumentDto,
  PaginatedResponse,
  CreateDocumentRequest,
  UpdateDocumentRequest,
  ListDocumentsParams,
} from '@ai-vault/types';

function buildQuery(params: Record<string, unknown>): string {
  const q = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`)
    .join('&');
  return q ? `?${q}` : '';
}

export const documentsApi = {
  list: (params: ListDocumentsParams = {}) =>
    api.get<PaginatedResponse<DocumentDto>>(`/documents${buildQuery(params as Record<string, unknown>)}`),

  get: (id: string) => api.get<DocumentDto>(`/documents/${id}`),

  create: (body: CreateDocumentRequest) => api.post<DocumentDto>('/documents', body),

  update: (id: string, body: UpdateDocumentRequest) =>
    api.patch<DocumentDto>(`/documents/${id}`, body),

  delete: (id: string) => api.delete<void>(`/documents/${id}`),

  replaceFile: (id: string, fileId: string) =>
    api.post<DocumentDto>(`/documents/${id}/replace-file`, { fileId }),
};
