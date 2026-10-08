import {
  IsString,
  IsEnum,
  IsOptional,
  IsBoolean,
  MinLength,
  MaxLength,
  IsObject,
} from 'class-validator';
import { DocumentType } from '@prisma/client';

export class CreateTemplateDto {
  @IsEnum(DocumentType)
  declare type: DocumentType;

  @IsOptional()
  @IsString()
  categoryId?: string;

  @IsString()
  @MinLength(1)
  @MaxLength(200)
  declare name: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsOptional()
  bodyJson?: unknown;

  @IsOptional()
  metaDefaults?: Record<string, unknown>;

  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}

export class UpdateTemplateDto {
  @IsOptional()
  @IsString()
  categoryId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsOptional()
  bodyJson?: unknown;

  @IsOptional()
  metaDefaults?: Record<string, unknown>;

  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}

export class ListTemplatesDto {
  @IsOptional()
  @IsEnum(DocumentType)
  type?: DocumentType;
}

export class PreviewTemplateDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  name?: string;

  @IsObject()
  declare bodyJson: object;

  @IsOptional()
  @IsObject()
  metaDefaults?: Record<string, unknown>;
}
