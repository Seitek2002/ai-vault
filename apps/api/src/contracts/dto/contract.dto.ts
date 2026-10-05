import { PartialType } from '@nestjs/mapped-types';
import { ContractTermUnit } from '@prisma/client';
import { Transform } from 'class-transformer';
import {
  IsArray,
  ArrayUnique,
  IsBoolean,
  IsDateString,
  IsInt,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class CreateContractDto {
  @IsOptional()
  @Transform(({ value }) => typeof value === 'string' ? value.trim() : value)
  @IsString()
  @MaxLength(100)
  number?: string;

  @IsString()
  @MinLength(1)
  declare counterpartyId: string;

  @IsString()
  @MinLength(2)
  @MaxLength(200)
  declare title: string;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(999999999999.99)
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
  startDate?: string | null;

  @IsOptional()
  @IsDateString()
  endDate?: string | null;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1200)
  termValue?: number | null;

  @IsOptional()
  @IsEnum(ContractTermUnit)
  termUnit?: ContractTermUnit | null;

  @IsOptional()
  @IsString()
  @MinLength(1)
  contractPdfId?: string | null;

  @IsOptional()
  @IsString()
  @MinLength(1)
  ndaPdfId?: string | null;

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  @MinLength(1, { each: true })
  additionalPdfIds?: string[];

  /** Документ с текстом договора. */
  @IsOptional()
  @IsString()
  documentId?: string;
}

export class UpdateContractDto extends PartialType(CreateContractDto, { skipNullProperties: false }) {}

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
