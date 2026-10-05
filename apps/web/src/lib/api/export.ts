import { api } from './client';

async function downloadBlob(path: string, filename: string) {
  const blob = await api.getBlob(path);
  const href = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = href;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Allow the browser to consume the object URL before releasing it.
  setTimeout(() => URL.revokeObjectURL(href), 1000);
}

export async function exportPdf(documentId: string, title: string) {
  await downloadBlob(`/documents/${documentId}/export/pdf`, `${title}.pdf`);
}

export async function exportDocx(documentId: string, title: string) {
  await downloadBlob(`/documents/${documentId}/export/docx`, `${title}.docx`);
}

export async function getOriginalFileUrl(documentId: string): Promise<string> {
  const { url } = await api.get<{ url: string }>(`/documents/${documentId}/export/original`);
  return url;
}

export async function downloadOriginalFile(documentId: string, filename: string) {
  await downloadBlob(`/documents/${documentId}/export/original-file`, filename);
}

export async function openOriginalFile(documentId: string) {
  // Reserve the tab during the click; opening it after an async request can
  // be blocked by the browser even when the file URL is valid.
  const tab = window.open('about:blank', '_blank');
  if (!tab) throw new Error('Разрешите открытие новой вкладки, чтобы просмотреть PDF.');
  tab.opener = null;
  try {
    const url = await getOriginalFileUrl(documentId);
    if (!tab.closed) tab.location.replace(url);
  } catch (err) {
    tab.close();
    throw err;
  }
}
