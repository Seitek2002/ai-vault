import { api } from './client';

export interface UploadedFileResponse {
  id: string;
  originalName: string;
  mimeType: string;
  size: number;
  s3Url: string;
}

export async function uploadFile(file: File): Promise<UploadedFileResponse> {
  const form = new FormData();
  form.append('file', file);
  return api.upload<UploadedFileResponse>('/files/upload', form);
}
