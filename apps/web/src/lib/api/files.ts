const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api';

function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('accessToken');
}

export interface UploadedFileResponse {
  id: string;
  originalName: string;
  mimeType: string;
  size: number;
  s3Url: string;
}

export async function uploadFile(file: File): Promise<UploadedFileResponse> {
  const token = getToken();
  const form = new FormData();
  form.append('file', file);

  const res = await fetch(`${API_BASE}/files/upload`, {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: form,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: res.statusText }));
    throw new Error((err as { message: string }).message ?? 'Upload failed');
  }

  return res.json() as Promise<UploadedFileResponse>;
}
