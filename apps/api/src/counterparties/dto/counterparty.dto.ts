import { IsString, IsEmail, IsOptional, MinLength, MaxLength, ValidateIf } from 'class-validator';

export class CreateCounterpartyDto {
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  declare name: string;

  @IsOptional()
  @ValidateIf((o: CreateCounterpartyDto) => !!o.inn)
  @IsString()
  @MaxLength(14)
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
}

export class UpdateCounterpartyDto extends CreateCounterpartyDto {}
