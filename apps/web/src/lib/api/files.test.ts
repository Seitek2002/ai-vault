import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getFileUrl, uploadFile } from './files';

const upload = vi.hoisted(() => vi.fn());
const get = vi.hoisted(() => vi.fn());
vi.mock('./client', () => ({ api: { upload, get } }));

function pdf(size: number) {
  const file = new File(['%PDF-1.4'], 'scan.pdf', { type: 'application/pdf' });
  vi.spyOn(file, 'size', 'get').mockReturnValue(size);
  return file;
}

describe('file upload size limit', () => {
  beforeEach(() => { upload.mockReset(); });

  it.each([20 * 1024 * 1024 + 1, 100 * 1024 * 1024])('sends files up to 100 MB (%i bytes)', async (size) => {
    upload.mockResolvedValue({ id: 'uploaded', size });
    await expect(uploadFile(pdf(size))).resolves.toMatchObject({ id: 'uploaded', size });
    expect(upload).toHaveBeenCalledOnce();
    expect(upload).toHaveBeenCalledWith('/files/upload', expect.any(FormData));
  });

  it('rejects 100 MB plus one byte before sending a request', async () => {
    await expect(uploadFile(pdf(100 * 1024 * 1024 + 1))).rejects.toThrow('100 МБ');
    expect(upload).not.toHaveBeenCalled();
  });
});

describe('private file preview URL', () => {
  beforeEach(() => { get.mockReset(); });

  it('asks the authenticated API for a temporary URL without opening a new tab', async () => {
    const open = vi.fn();
    vi.stubGlobal('window', { open });
    try {
      get.mockResolvedValue({ url: 'https://storage.example.test/private.pdf?signature=temporary' });
      await expect(getFileUrl('act-file')).resolves.toBe('https://storage.example.test/private.pdf?signature=temporary');
      expect(get).toHaveBeenCalledExactlyOnceWith('/files/act-file/url');
      expect(open).not.toHaveBeenCalled();
    } finally { vi.unstubAllGlobals(); }
  });

  it('propagates denied access so the preview can display the error', async () => {
    get.mockRejectedValue(new Error('Файл не найден'));
    await expect(getFileUrl('unavailable-file')).rejects.toThrow('Файл не найден');
  });
});
