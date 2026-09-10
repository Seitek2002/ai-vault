import { PartialType } from '@nestjs/mapped-types';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class CreateContractDto {
  @IsString()
  declare counterpartyId: string;

  @IsString()
  @MinLength(2)
  @MaxLength(200)
  declare title: string;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  declare defaultAmount: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  vatRate?: number;

  @IsOptional()
  @IsString()
  @MaxLength(3)
  currency?: string;

  /** День месяца, когда создаётся расчёт. 28 — максимум, чтобы был в любом месяце. */
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(28)
  billingDay?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(180)
  paymentDueDays?: number;

  @IsOptional()
  @IsBoolean()
  esfRequired?: boolean;

  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  /** Документ с текстом договора. */
  @IsOptional()
  @IsString()
  documentId?: string;
}

export class UpdateContractDto extends PartialType(CreateContractDto) {}

export class ListContractsDto {
  @IsOptional()
  @IsString()
  counterpartyId?: string;

  @IsOptional()
  @IsString()
  search?: string;

  // Query-параметр приходит строкой — приводим до валидации.
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  activeOnly?: boolean;
}
