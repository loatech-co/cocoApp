import { IsIn, IsOptional } from 'class-validator';

import { USER_STATUSES } from '../../../../contract/v2/auth.response';
import { PageQuery } from '../../../../contract/v2/page.dto';

export class ListUsersQuery extends PageQuery {
  /** Only the users in this state. */
  @IsOptional()
  @IsIn(USER_STATUSES)
  status?: (typeof USER_STATUSES)[number];
}
