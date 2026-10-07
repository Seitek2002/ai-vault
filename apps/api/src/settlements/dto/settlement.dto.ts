import { Transform, Type } from 'class-transformer';
import {
  IsDateString,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUrl,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';

const MIN_YEAR = 2000;
const MAX_YEAR = 2100;

export class ListSettlementsDto {
  @Type(() => Number)
  @IsInt()
  @Min(MIN_YEAR)
  @Max(MAX_YEAR)
  declare year: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(12)
  declare month: number;

  @IsOptional()
  @IsString()
  counterpartyId?: string;
}

export class GenerateSettlementsDto {
  @IsInt()
  @Min(MIN_YEAR)
  @Max(MAX_YEAR)
  declare year: number;

  @IsInt()
  @Min(1)
  @Max(12)
  declare month: number;

  /** Если не задан — генерируются расчёты по всем активным договорам. */
  @IsOptional()
  @IsString()
  contractId?: string;
}

export class CreateSettlementDto {
  @IsString()
  @MinLength(1)
  declare contractId: string;

  @IsInt()
  @Min(MIN_YEAR)
  @Max(MAX_YEAR)
  declare year: number;

  @IsInt()
  @Min(1)
  @Max(12)
  declare month: number;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(999999999999.99)
  declare amount: number;

  @IsOptional()
  @Transform(({ value }) => typeof value === 'string' ? value.trim() : value)
  @IsString()
  @MaxLength(200)
  label?: string;
}

export class UpdateSettlementDto {
  @ValidateIf((_object, value) => value !== undefined)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(999999999999.99)
  amount?: number;

  @ValidateIf((_object, value) => value !== undefined)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(999999999999.99)
  vatAmount?: number;
}

export class CompleteStepDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;

  @IsOptional()
  @IsString()
  fileAssetId?: string;

  @IsOptional()
  @IsString()
  documentId?: string;

  @IsOptional()
  @Transform(({ value }) => typeof value === 'string' ? value.trim() : value)
  @IsUrl({ protocols: ['http', 'https'], require_protocol: true, disallow_auth: true })
  @MaxLength(2048)
  evidenceUrl?: string;
}

export class GenerateStepDocumentDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  templateId?: string;
}

export class CreatePaymentDto {
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  declare amount: number;

  @IsDateString()
  declare paidAt: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  reference?: string;

  @IsOptional()
  @IsString()
  fileAssetId?: string;
}
