import { api } from './client';
import type {
  DocumentDto,
  PaginatedResponse,
  CreateDocumentRequest,
  UpdateDocumentRequest,
  ListDocumentsParams,
} from '@ai-vault/types';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api';

function buildQuery(params: Record<string, unknown>): string {
  const q = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`)
    .join('&');
  return q ? `?${q}` : '';
}

async function uploadContentImage(file: File): Promise<{ url: string }> {
  const token = typeof window !== 'undefined' ? localStorage.getItem('accessToken') : null;
  const form = new FormData();
  form.append('file', file);

  const res = await fetch(`${API_BASE}/documents/content-image`, {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: form,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: res.statusText }));
    throw new Error((err as { message: string }).message ?? 'Upload failed');
  }

  return res.json() as Promise<{ url: string }>;
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

  uploadContentImage,
};
