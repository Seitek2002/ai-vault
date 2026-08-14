import { IsString, IsOptional, MinLength, MaxLength } from 'class-validator';

export class CreateLetterheadDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  declare name: string;

  @IsOptional()
  bodyJson?: unknown;
}

export class UpdateLetterheadDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  name?: string;

  @IsOptional()
  bodyJson?: unknown;
}

export class ListLetterheadsDto {
  @IsOptional()
  @IsString()
  search?: string;
}
