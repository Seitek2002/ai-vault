import { beforeEach, describe, expect, it, vi } from 'vitest';
import { uploadFile } from './files';

const upload = vi.hoisted(() => vi.fn());
vi.mock('./client', () => ({ api: { upload } }));

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
