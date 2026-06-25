const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api';

function getToken() {
  return typeof window !== 'undefined' ? localStorage.getItem('accessToken') : null;
}

async function downloadBlob(url: string, filename: string) {
  const token = getToken();
  const res = await fetch(url, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) throw new Error(`Export failed: ${res.status}`);
  const blob = await res.blob();
  const href = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = href;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(href);
}

export async function exportPdf(documentId: string, title: string) {
  await downloadBlob(`${API}/documents/${documentId}/export/pdf`, `${title}.pdf`);
}

export async function exportDocx(documentId: string, title: string) {
  await downloadBlob(`${API}/documents/${documentId}/export/docx`, `${title}.docx`);
}

export async function openOriginalFile(documentId: string) {
  const token = getToken();
  const res = await fetch(`${API}/documents/${documentId}/export/original`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) throw new Error(`Failed to get original file: ${res.status}`);
  const { url } = (await res.json()) as { url: string };
  window.open(url, '_blank');
}
