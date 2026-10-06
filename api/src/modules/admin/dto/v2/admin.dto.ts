import { IsEnum, IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

import { USER_STATUSES } from '../../../../contract/v2/auth.response';
import { PageQuery } from '../../../../contract/v2/page.dto';
import type { UserRole } from '../../../../generated/prisma/client';

export class ListUsersQuery extends PageQuery {
  /** Only the users in this state. */
  @IsOptional()
  @IsIn(USER_STATUSES)
  status?: (typeof USER_STATUSES)[number];
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
