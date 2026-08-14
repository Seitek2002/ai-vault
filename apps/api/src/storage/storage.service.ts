import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  CreateBucketCommand,
  HeadBucketCommand,
  PutBucketPolicyCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Readable } from 'stream';

@Injectable()
export class StorageService implements OnModuleInit {
  private readonly logger = new Logger(StorageService.name);
  private readonly s3: S3Client;
  private readonly bucket: string;
  private readonly publicUrl: string;

  constructor(private config: ConfigService) {
    const endpoint = this.config.get<string>('MINIO_ENDPOINT') ?? 'http://localhost:9000';
    this.bucket = this.config.get<string>('MINIO_BUCKET') ?? 'ai-vault';
    const publicUrlConfigured = this.config.get<string>('MINIO_PUBLIC_URL');
    this.publicUrl = publicUrlConfigured ?? endpoint;

    // Every stored file's URL is built from this value and saved permanently
    // (avatarUrl, logoUrl, backgroundImageUrl, exported PDFs, ...) — if it
    // silently falls back to MINIO_ENDPOINT (often a Docker-internal
    // hostname like "minio", unreachable from a real browser), every image
    // in the app renders broken with no error anywhere. Fail loudly instead.
    if (!publicUrlConfigured) {
      this.logger.warn(
        `MINIO_PUBLIC_URL is not set — falling back to MINIO_ENDPOINT ("${endpoint}") for all stored file URLs. ` +
          `If that's a Docker-internal hostname, every uploaded image/avatar/logo/export will be broken in the browser. ` +
          `Set MINIO_PUBLIC_URL to the URL browsers can actually reach.`,
      );
    }

    this.s3 = new S3Client({
      endpoint,
      region: 'us-east-1', // MinIO ignores region but S3Client requires it
      credentials: {
        accessKeyId: this.config.get<string>('MINIO_ACCESS_KEY') ?? 'minioadmin',
        secretAccessKey: this.config.get<string>('MINIO_SECRET_KEY') ?? 'minioadmin',
      },
      forcePathStyle: true, // required for MinIO
    });
  }

  async onModuleInit() {
    try {
      await this.s3.send(new HeadBucketCommand({ Bucket: this.bucket }));
    } catch {
      try {
        await this.s3.send(new CreateBucketCommand({ Bucket: this.bucket }));
        this.logger.log(`Created bucket: ${this.bucket}`);
      } catch (err) {
        this.logger.warn(`Could not create bucket "${this.bucket}": ${(err as Error).message}`);
      }
    }

    // Every uploaded object (avatars, background photos, exported/imported files) is
    // referenced directly via its public s3Url, so the bucket needs a public-read
    // policy — without it, GETs 403 even though uploads succeed. Idempotent, safe to
    // re-apply on every boot.
    try {
      await this.s3.send(
        new PutBucketPolicyCommand({
          Bucket: this.bucket,
          Policy: JSON.stringify({
            Version: '2012-10-17',
            Statement: [
              {
                Effect: 'Allow',
                Principal: '*',
                Action: ['s3:GetObject'],
                Resource: [`arn:aws:s3:::${this.bucket}/*`],
              },
            ],
          }),
        }),
      );
    } catch (err) {
      this.logger.warn(`Could not set public-read policy on bucket "${this.bucket}": ${(err as Error).message}`);
    }
  }

  async upload(key: string, body: Buffer, contentType: string): Promise<string> {
    await this.s3.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
      }),
    );
    return `${this.publicUrl}/${this.bucket}/${key}`;
  }

  async download(key: string): Promise<Buffer> {
    const response = await this.s3.send(
      new GetObjectCommand({ Bucket: this.bucket, Key: key }),
    );
    const stream = response.Body as Readable;
    return new Promise<Buffer>((resolve, reject) => {
      const chunks: Buffer[] = [];
      stream.on('data', (c: Buffer) => chunks.push(c));
      stream.on('end', () => resolve(Buffer.concat(chunks)));
      stream.on('error', reject);
    });
  }

  async presignedUrl(key: string, expiresIn = 3600): Promise<string> {
    return getSignedUrl(
      this.s3,
      new GetObjectCommand({ Bucket: this.bucket, Key: key }),
      { expiresIn },
    );
  }
}
