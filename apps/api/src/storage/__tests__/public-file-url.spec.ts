import { ConfigService } from '@nestjs/config';
import { S3Client } from '@aws-sdk/client-s3';
import { describe, expect, it, vi } from 'vitest';
import { StorageService } from '../storage.service';

function storage(publicUrl?: string) {
  const config = new ConfigService({
    MINIO_ENDPOINT: 'http://minio:9000',
    MINIO_PUBLIC_URL: publicUrl,
    MINIO_BUCKET: 'test-vault',
    MINIO_ACCESS_KEY: 'test-access',
    MINIO_SECRET_KEY: 'test-secret',
  });
  return new StorageService(config);
}

describe('Browser-facing private file URLs', () => {
  it('signs the public host instead of the Docker-internal endpoint', async () => {
    const service = storage('https://files.example.test');
    const url = new URL(await service.presignedUrl('org-1/act.pdf', 600));
    expect(url.origin).toBe('https://files.example.test');
    expect(url.pathname).toBe('/test-vault/org-1/act.pdf');
    expect(url.searchParams.get('X-Amz-Expires')).toBe('600');
    expect(url.searchParams.get('X-Amz-SignedHeaders')).toBe('host');
    expect(url.searchParams.get('X-Amz-Signature')).toMatch(/^[a-f0-9]{64}$/);
  });

  it('keeps the signature valid when nginx strips the browser-only /s3/ prefix', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-06T00:00:00Z'));
    try {
      const url = new URL(await storage('https://vault.example.test/s3/').presignedUrl('org-1/акт 1.pdf'));
      const root = new URL(await storage('https://vault.example.test').presignedUrl('org-1/акт 1.pdf'));
      expect(url.origin).toBe('https://vault.example.test');
      expect(decodeURIComponent(url.pathname)).toBe('/s3/test-vault/org-1/акт 1.pdf');
      url.pathname = url.pathname.slice('/s3'.length);
      expect(url.toString()).toBe(root.toString());
    } finally {
      vi.useRealTimers();
    }
  });

  it('keeps server uploads on the internal endpoint', async () => {
    const service = storage('https://files.example.test');
    const internal = (service as unknown as { s3: S3Client }).s3;
    const send = vi.spyOn(internal, 'send').mockResolvedValue({} as never);
    const result = await service.upload('org-1/invoice.pdf', Buffer.from('%PDF-1.4'), 'application/pdf');
    expect((await internal.config.endpoint!()).hostname).toBe('minio');
    expect(send).toHaveBeenCalledOnce();
    expect(result).toBe('https://files.example.test/test-vault/org-1/invoice.pdf');
  });

  it('uses the configured endpoint when no separate public URL exists', async () => {
    const url = new URL(await storage().presignedUrl('org-1/file.pdf'));
    expect(url.origin).toBe('http://minio:9000');
  });
});
