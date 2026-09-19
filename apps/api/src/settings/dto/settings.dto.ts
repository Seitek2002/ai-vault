import { IsString, IsEmail, IsOptional, IsNumber, IsBoolean, Min, Max, MinLength, MaxLength } from 'class-validator';

export class UpdateSettingsDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  name?: string;

  @IsOptional()
  @IsString()
  @MinLength(9)
  @MaxLength(20)
  inn?: string;

  @IsOptional()
  @IsString()
  bin?: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  bankAccount?: string;

  @IsOptional()
  @IsString()
  bankName?: string;

  @IsOptional()
  @IsString()
  bankBik?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  vatRate?: number;

  @IsOptional()
  @IsString()
  currency?: string;

  // ── Кабинет ЭСФ (esf.salyk.kg) ──
  // Пароль принимается только на запись: шифруется и в ответах не появляется.

  @IsOptional()
  @IsString()
  @MaxLength(100)
  esfLogin?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  esfPassword?: string;

  /** Отключить кабинет — стереть логин и пароль. */
  @IsOptional()
  @IsBoolean()
  esfClear?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(10)
  actPrefix?: string;

  @IsOptional()
  @IsString()
  @MaxLength(10)
  invoicePrefix?: string;
}
