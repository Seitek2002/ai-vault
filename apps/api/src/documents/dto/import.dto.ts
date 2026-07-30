import { IsString, IsEnum, IsOptional } from 'class-validator';
import { DocumentType } from '@prisma/client';

export class ImportDocumentDto {
  @IsString()
  declare fileId: string;

  @IsEnum(DocumentType)
  declare type: DocumentType;

  @IsString()
  declare counterpartyId: string;

  @IsOptional()
  @IsString()
  categoryId?: string;
}
