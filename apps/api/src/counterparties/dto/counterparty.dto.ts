import { IsString, IsEmail, IsOptional, MinLength, MaxLength, ValidateIf } from 'class-validator';
import { Transform } from 'class-transformer';

const optionalContact = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() || null : value;

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
  @Transform(optionalContact)
  @IsString()
  phone?: string | null;

  @IsOptional()
  @Transform(optionalContact)
  @IsEmail()
  email?: string | null;

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
