import Fastify from 'fastify';
import multipart from '@fastify/multipart';
import { describe, expect, it } from 'vitest';
import { MAX_UPLOAD_SIZE_BYTES } from '../upload-limits';

async function upload(size: number) {
  const app = Fastify();
  await app.register(multipart, { limits: { fileSize: MAX_UPLOAD_SIZE_BYTES } });
  app.post('/upload', async (req) => {
    const file = await req.file();
    return { size: (await file!.toBuffer()).length };
  });
  const boundary = 'upload-size-boundary';
  const payload = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="scan.pdf"\r\nContent-Type: application/pdf\r\n\r\n`),
    Buffer.alloc(size, 0x20),
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ]);
  try {
    return await app.inject({ method: 'POST', url: '/upload',
      headers: { 'content-type': `multipart/form-data; boundary=${boundary}` }, payload });
  } finally {
    await app.close();
  }
}

describe('multipart file limit', () => {
  it('accepts an actual 100 MB file including multipart overhead', async () => {
    const response = await upload(100 * 1024 * 1024);
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ size: 100 * 1024 * 1024 });
  }, 20_000);

  it('rejects an actual file one byte over 100 MB with HTTP 413', async () => {
    const response = await upload(100 * 1024 * 1024 + 1);
    expect(response.statusCode).toBe(413);
    expect(response.json().code).toBe('FST_REQ_FILE_TOO_LARGE');
  }, 20_000);
});
