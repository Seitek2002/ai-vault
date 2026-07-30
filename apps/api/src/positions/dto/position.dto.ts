import { IsString, IsArray, IsEnum, IsOptional, MinLength, MaxLength } from 'class-validator';
import { Permission } from '../../common/permissions';

export class CreatePositionDto {
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  declare name: string;

  @IsArray()
  @IsEnum(Permission, { each: true })
  declare permissions: Permission[];
}

export class UpdatePositionDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name?: string;

  @IsOptional()
  @IsArray()
  @IsEnum(Permission, { each: true })
  permissions?: Permission[];
}
