import {
  Controller,
  Post,
  Req,
  BadRequestException,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { FastifyRequest } from 'fastify';
import { FilesService } from './files.service';
import { CurrentUser, type JwtPayload } from '../common/decorators/current-user.decorator';

interface MultipartFile {
  filename: string;
  mimetype: string;
  toBuffer: () => Promise<Buffer>;
}

@Controller('files')
export class FilesController {
  constructor(private service: FilesService) {}

  @Post('upload')
  @HttpCode(HttpStatus.CREATED)
  async upload(@Req() req: FastifyRequest, @CurrentUser() user: JwtPayload) {
    // @fastify/multipart exposes req.file() after registration
    const file = await (req as FastifyRequest & { file: () => Promise<MultipartFile | undefined> }).file();
    if (!file) throw new BadRequestException('No file provided');

    const buffer = await file.toBuffer();
    const asset = await this.service.upload(user.organizationId, user.sub, {
      buffer,
      originalName: file.filename,
      mimeType: file.mimetype,
    });

    return {
      id: asset.id,
      originalName: asset.originalName,
      mimeType: asset.mimeType,
      size: asset.size,
      s3Url: asset.s3Url,
    };
  }
}
