import { IsString, IsOptional, MinLength, MaxLength, Matches } from 'class-validator';

export class CreateDocumentCategoryDto {
  @IsString()
  @MinLength(1)
  @MaxLength(60)
  declare name: string;

  @IsString()
  @MinLength(1)
  @MaxLength(12)
  declare shortLabel: string;

  @IsString()
  @Matches(/^#[0-9a-fA-F]{6}$/)
  declare color: string;
}

export class UpdateDocumentCategoryDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(60)
  name?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(12)
  shortLabel?: string;

  @IsOptional()
  @IsString()
  @Matches(/^#[0-9a-fA-F]{6}$/)
  color?: string;
}
