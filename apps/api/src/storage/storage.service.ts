import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  CreateBucketCommand,
  HeadBucketCommand,
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
    this.publicUrl = this.config.get<string>('MINIO_PUBLIC_URL') ?? endpoint;

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
