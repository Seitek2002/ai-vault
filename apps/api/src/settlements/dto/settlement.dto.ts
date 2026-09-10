import { Type } from 'class-transformer';
import {
  IsDateString,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
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

export class UpdateSettlementDto {
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  amount?: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
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
