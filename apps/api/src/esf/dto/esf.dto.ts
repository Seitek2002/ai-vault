import { Transform, Type } from 'class-transformer';
import { ArrayMaxSize, ArrayNotEmpty, ArrayUnique, IsArray, IsBoolean, IsHexadecimal, IsInt, IsNumber, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min, MinLength, ValidateIf, ValidateNested } from 'class-validator';

export class EsfDraftLineDto {
  @IsString()
  @MinLength(1)
  @MaxLength(150)
  declare name: string;

  @IsNumber({ maxDecimalPlaces: 5 })
  @Min(0.00001)
  @Max(1e9)
  declare quantity: number;

  @IsNumber({ maxDecimalPlaces: 5 })
  @Min(0.00001)
  @Max(1e9)
  declare price: number;

  /** Номер строки ЭСФ-образца; нет — строку добавил менеджер. */
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(99)
  source?: number;

  /** Единица и ГКЭД — только у добавленных строк. */
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(50)
  unit?: string;

  @IsOptional()
  @Matches(/^\d{2}\.\d{2}(\.\d{1,2})?$/, { message: 'Код ГКЭД указан неверно, например 62.02.0.' })
  gked?: string;
}

export class CreateEsfDraftDto {
  @IsUUID()
  declare sourceUuid: string;

  @IsHexadecimal()
  @MinLength(64)
  @MaxLength(64)
  declare sourceSignature: string;

  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => EsfDraftLineDto)
  declare lines: EsfDraftLineDto[];

  /** Период услуг — по умолчанию предыдущий месяц, менеджер может его сменить. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(2000)
  @Max(2100)
  periodYear?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(12)
  periodMonth?: number;

  /** Дата поставки, yyyy-mm-dd. */
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'Дата поставки указана неверно.' })
  deliveryDate?: string;

  /** «Примечание» ЭСФ; пусто — Vault подставит договор и период. */
  @IsOptional()
  @IsString()
  @MaxLength(250)
  note?: string;
}

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
