import { Transform, Type } from 'class-transformer';
import { ArrayMaxSize, ArrayNotEmpty, ArrayUnique, IsArray, IsBoolean, IsInt, IsOptional, IsString, Max, Min, MinLength, ValidateIf } from 'class-validator';

export class ListEsfDto {
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  unmatchedOnly?: boolean;

  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  hiddenOnly?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(2000)
  @Max(2100)
  year?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(12)
  month?: number;
}

export class AttachEsfDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  settlementId?: string;

  @ValidateIf((o) => o.settlementId == null || o.settlementIds !== undefined)
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(120)
  @ArrayUnique()
  @IsString({ each: true })
  @MinLength(1, { each: true })
  settlementIds?: string[];
}

export class DetachEsfDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  settlementId?: string;
}

export class CheckEsfConnectionDto {
  @IsString()
  @MinLength(1)
  declare login: string;

  @IsString()
  @MinLength(1)
  declare password: string;
}
