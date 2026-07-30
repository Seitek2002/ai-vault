import { api } from './client';
import type { DocumentCategoryDto } from '@ai-vault/types';

export type DocumentCategory = DocumentCategoryDto;

export interface CreateDocumentCategoryDto {
  name: string;
  shortLabel: string;
  color: string;
}

export interface UpdateDocumentCategoryDto {
  name?: string;
  shortLabel?: string;
  color?: string;
}

export const documentCategoriesApi = {
  list: () => api.get<DocumentCategory[]>('/document-categories'),
  create: (dto: CreateDocumentCategoryDto) => api.post<DocumentCategory>('/document-categories', dto),
  update: (id: string, dto: UpdateDocumentCategoryDto) =>
    api.patch<DocumentCategory>(`/document-categories/${id}`, dto),
  remove: (id: string) => api.delete<void>(`/document-categories/${id}`),
};
