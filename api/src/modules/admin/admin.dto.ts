import type { UserRole, UserStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export class ListUsersQueryDto {
  @IsOptional()
  @IsEnum(['pending', 'active', 'suspended'])
  status?: UserStatus;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  per_page?: number;
}

export class ChangeRoleDto {
  @IsEnum(['admin', 'user'])
  role!: UserRole;
}

export class ResetPasswordDto {
  @IsString()
  @MaxLength(128)
  newPassword!: string;
}
