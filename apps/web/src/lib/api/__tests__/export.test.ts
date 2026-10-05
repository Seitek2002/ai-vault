import { afterEach, describe, expect, it, vi } from 'vitest';
import { api } from '../client';
import { openOriginalFile, downloadOriginalFile } from '../export';

vi.mock('../client', () => ({ api: { get: vi.fn(), getBlob: vi.fn() } }));

function browser(closed = false) {
  const tab = { opener: {}, closed, location: { replace: vi.fn() }, close: vi.fn() };
  const open = vi.fn().mockReturnValue(tab);
  vi.stubGlobal('window', { open });
  return { tab, open };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
  vi.useRealTimers();
});

describe('Downloading an archived original', () => {
  it('downloads authenticated original bytes and releases its URL after the click', async () => {
    vi.useFakeTimers();
    const blob = new Blob(['%PDF-1.4'], { type: 'application/pdf' });
    vi.mocked(api.getBlob).mockResolvedValue(blob);
    const link = { href: '', download: '', click: vi.fn(), remove: vi.fn() };
    const appendChild = vi.fn();
    const urls = { createObjectURL: vi.fn().mockReturnValue('blob:archive-pdf'), revokeObjectURL: vi.fn() };
    vi.stubGlobal('document', { createElement: vi.fn().mockReturnValue(link), body: { appendChild } });
    vi.stubGlobal('URL', urls);
    await downloadOriginalFile('doc-1', 'Договор.pdf');
    expect(api.getBlob).toHaveBeenCalledWith('/documents/doc-1/export/original-file');
    expect(urls.createObjectURL).toHaveBeenCalledWith(blob);
    expect(link.href).toBe('blob:archive-pdf');
    expect(link.download).toBe('Договор.pdf');
    expect(link.click).toHaveBeenCalledOnce();
    expect(appendChild).toHaveBeenCalledWith(link);
    expect(link.remove).toHaveBeenCalledOnce();
    expect(urls.revokeObjectURL).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1000);
    expect(urls.revokeObjectURL).toHaveBeenCalledWith('blob:archive-pdf');
  });

  it('reports storage or permission failures without creating a download', async () => {
    vi.mocked(api.getBlob).mockRejectedValue(new Error('Файл недоступен'));
    const createElement = vi.fn();
    vi.stubGlobal('document', { createElement });
    await expect(downloadOriginalFile('doc-1', 'Договор.pdf')).rejects.toThrow('Файл недоступен');
    expect(createElement).not.toHaveBeenCalled();
  });
});

describe('Opening an archived original', () => {
  it('reserves a safe tab during the click before waiting for the file URL', async () => {
    const { tab, open } = browser();
    let resolve!: (value: { url: string }) => void;
    vi.mocked(api.get).mockReturnValue(new Promise((done) => { resolve = done; }));
    const opening = openOriginalFile('doc-1');
    expect(open).toHaveBeenCalledWith('about:blank', '_blank');
    expect(tab.opener).toBeNull();
    expect(tab.location.replace).not.toHaveBeenCalled();
    resolve({ url: 'https://files.example.test/archive.pdf' });
    await opening;
    expect(tab.location.replace).toHaveBeenCalledWith('https://files.example.test/archive.pdf');
    expect(tab.close).not.toHaveBeenCalled();
  });

  it('reports blocked tabs without claiming the file opened', async () => {
    const { open } = browser();
    open.mockReturnValue(null);
    await expect(openOriginalFile('doc-1')).rejects.toThrow('Разрешите открытие новой вкладки');
    expect(api.get).not.toHaveBeenCalled();
  });

  it('closes the reserved tab and reports download errors', async () => {
    const { tab } = browser();
    vi.mocked(api.get).mockRejectedValue(new Error('Файл не найден'));
    await expect(openOriginalFile('missing')).rejects.toThrow('Файл не найден');
    expect(tab.close).toHaveBeenCalledOnce();
    expect(tab.location.replace).not.toHaveBeenCalled();
  });

  it('respects a tab closed while the request was pending', async () => {
    const { tab } = browser(true);
    vi.mocked(api.get).mockResolvedValue({ url: 'https://files.example.test/archive.pdf' });
    await openOriginalFile('doc-1');
    expect(tab.location.replace).not.toHaveBeenCalled();
  });
});
