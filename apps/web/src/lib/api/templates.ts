import { api } from './client';
import type { DocumentType, DocumentCategoryDto } from '@ai-vault/types';

export interface TemplateDto {
  id: string;
  organizationId: string;
  type: DocumentType;
  categoryId: string | null;
  category?: DocumentCategoryDto | null;
  name: string;
  description: string | null;
  bodyJson: unknown;
  metaDefaults: unknown;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateTemplateRequest {
  type: DocumentType;
  categoryId?: string;
  name: string;
  description?: string;
  bodyJson?: unknown;
  metaDefaults?: Record<string, unknown>;
  isDefault?: boolean;
}

export interface UpdateTemplateRequest {
  categoryId?: string;
  name?: string;
  description?: string;
  bodyJson?: unknown;
  metaDefaults?: Record<string, unknown>;
  isDefault?: boolean;
}

export const templatesApi = {
  list: (type?: DocumentType) =>
    api.get<TemplateDto[]>(`/templates${type ? `?type=${type}` : ''}`),

  get: (id: string) => api.get<TemplateDto>(`/templates/${id}`),

  create: (body: CreateTemplateRequest) => api.post<TemplateDto>('/templates', body),

  update: (id: string, body: UpdateTemplateRequest) =>
    api.patch<TemplateDto>(`/templates/${id}`, body),

  delete: (id: string) => api.delete<void>(`/templates/${id}`),
};
