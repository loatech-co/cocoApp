import { IsBoolean } from 'class-validator';

import { IfPresent } from '../../../../common/validation/if-present.decorator';

export class UpdatePreferencesInput {
  /** Whether this user keeps accounts at all. */
  @IfPresent()
  @IsBoolean()
  accountsEnabled?: boolean;
}
