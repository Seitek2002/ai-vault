import { api } from './client';

async function downloadBlob(path: string, filename: string) {
  const blob = await api.getBlob(path);
  const href = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = href;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(href);
}

export async function exportPdf(documentId: string, title: string) {
  await downloadBlob(`/documents/${documentId}/export/pdf`, `${title}.pdf`);
}

export async function exportDocx(documentId: string, title: string) {
  await downloadBlob(`/documents/${documentId}/export/docx`, `${title}.docx`);
}

export async function openOriginalFile(documentId: string) {
  const { url } = await api.get<{ url: string }>(`/documents/${documentId}/export/original`);
  window.open(url, '_blank');
}
