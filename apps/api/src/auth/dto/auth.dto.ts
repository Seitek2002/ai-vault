import { IsEmail, IsString, IsOptional, IsEnum, MinLength, MaxLength } from 'class-validator';
import { UserRole } from '@prisma/client';

export class RegisterDto {
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  declare name: string;

  @IsEmail()
  declare email: string;

  @IsString()
  @MinLength(8)
  declare password: string;

  @IsString()
  @MinLength(2)
  @MaxLength(100)
  @IsOptional()
  organizationName?: string;
}

export class LoginDto {
  @IsEmail()
  declare email: string;

  @IsString()
  declare password: string;
}

export class RefreshDto {
  @IsString()
  declare refreshToken: string;
}

export class AddMemberDto {
  @IsEmail()
  declare email: string;

  @IsOptional()
  @IsString()
  positionId?: string;
}

/** Mode 2: create a brand-new account and attach it to the caller's organization directly. */
export class CreateMemberDto {
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  declare name: string;

  @IsEmail()
  declare email: string;

  @IsString()
  @MinLength(8)
  declare password: string;

  @IsOptional()
  @IsString()
  positionId?: string;
}

export class UpdateMemberDto {
  @IsOptional()
  @IsString()
  positionId?: string | null;

  @IsOptional()
  @IsEnum(UserRole)
  role?: UserRole;
}

export class CreateOrganizationDto {
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  declare name: string;
}

export class UpdateMeDto {
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  @IsOptional()
  name?: string;

  @IsString()
  @MinLength(8)
  @IsOptional()
  newPassword?: string;

  @IsString()
  @IsOptional()
  currentPassword?: string;
}
