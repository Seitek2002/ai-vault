import type { DocumentDto, DocumentType, DocumentStatus } from './documents';

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
}

export interface ApiError {
  statusCode: number;
  message: string | string[];
  error?: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface LoginResponse {
  accessToken: string;
  refreshToken: string;
}

export interface ListDocumentsParams {
  page?: number;
  limit?: number;
  type?: DocumentType;
  status?: DocumentStatus;
  counterpartyId?: string;
  search?: string;
  dateFrom?: string;
  dateTo?: string;
}

export interface CreateDocumentRequest {
  type: DocumentType;
  title: string;
  counterpartyId?: string;
  templateId?: string;
  bodyJson?: unknown;
  meta?: Record<string, unknown>;
}

export interface UpdateDocumentRequest {
  title?: string;
  status?: DocumentStatus;
  counterpartyId?: string;
  meta?: Record<string, unknown>;
  bodyJson?: unknown;
}

export interface AiEditRequest {
  instruction: string;
  contextText?: string;
}

export interface AiEditResponse {
  newBodyJson: unknown;
  changes: Array<{
    type: 'INSERT' | 'DELETE';
    from: number;
    to: number;
    content: string;
  }>;
}

export interface FileUploadResponse {
  id: string;
  url: string;
  originalName: string;
  mimeType: string;
  size: number;
}

export interface ImportDocumentRequest {
  fileId: string;
  type: DocumentType;
}

export interface ImportDocumentResponse {
  document: DocumentDto;
  rawText: string;
}
