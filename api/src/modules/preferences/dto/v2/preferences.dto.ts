import { IsBoolean, IsOptional } from 'class-validator';

export class UpdatePreferencesInput {
  /** Whether this user keeps accounts at all. */
  @IsOptional()
  @IsBoolean()
  accountsEnabled?: boolean;
}
