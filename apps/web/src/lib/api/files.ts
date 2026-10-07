import { api } from './client';

export const MAX_UPLOAD_SIZE_MB = 100;
export const MAX_UPLOAD_SIZE_BYTES = MAX_UPLOAD_SIZE_MB * 1024 * 1024;

export interface UploadedFileResponse {
  id: string;
  originalName: string;
  mimeType: string;
  size: number;
  s3Url: string;
}

/** Открыть файл в новой вкладке по короткоживущей ссылке. */
export async function openFile(id: string): Promise<void> {
  const { url } = await api.get<{ url: string }>(`/files/${id}/url`);
  window.open(url, '_blank', 'noopener');
}

export async function uploadFile(file: File): Promise<UploadedFileResponse> {
  if (file.size > MAX_UPLOAD_SIZE_BYTES) {
    throw new Error(`Размер файла не должен превышать ${MAX_UPLOAD_SIZE_MB} МБ`);
  }
  const form = new FormData();
  form.append('file', file);
  return api.upload<UploadedFileResponse>('/files/upload', form);
}
