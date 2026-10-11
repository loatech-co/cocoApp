import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

import { IfPresent } from '../../../../common/validation/if-present.decorator';
import { IsMoney } from '../../../../common/validation/is-money.decorator';
import { ACCOUNT_TYPES } from '../../../../contract/v2/accounts.response';
import { PageQuery } from '../../../../contract/v2/page.dto';

type AccountType = (typeof ACCOUNT_TYPES)[number];

export class CreateAccountInput {
  @IsString()
  @MinLength(1, { message: 'El nombre no puede estar vacío.' })
  @MaxLength(255)
  name!: string;

  @IsIn(ACCOUNT_TYPES, { message: 'El tipo de cuenta no es válido.' })
  type!: AccountType;

  @IfPresent()
  @IsString()
  @MaxLength(255)
  institution?: string;

  @IfPresent()
  @Matches(/^\d{4}$/, { message: 'last4 deben ser exactamente 4 dígitos.' })
  last4?: string;

  @IfPresent()
  @IsMoney()
  creditLimit?: string;

  @IfPresent()
  @IsInt()
  @Min(1)
  @Max(31)
  cutoffDay?: number;

  @IfPresent()
  @IsInt()
  @Min(1)
  @Max(31)
  paymentDay?: number;

  @IfPresent()
  @IsMoney()
  openingBalance?: string;
}

export class UpdateAccountInput {
  @IfPresent()
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  name?: string;

  @IfPresent()
  @IsIn(ACCOUNT_TYPES)
  type?: AccountType;

  @IfPresent()
  @IsString()
  @MaxLength(255)
  institution?: string;

  @IfPresent()
  @Matches(/^\d{4}$/)
  last4?: string;

  @IfPresent()
  @IsMoney()
  creditLimit?: string;

  @IfPresent()
  @IsInt()
  @Min(1)
  @Max(31)
  cutoffDay?: number;

  @IfPresent()
  @IsInt()
  @Min(1)
  @Max(31)
  paymentDay?: number;

  @IfPresent()
  @IsMoney()
  openingBalance?: string;

  @IfPresent()
  @IsBoolean()
  isArchived?: boolean;
}

export class ListAccountsQuery extends PageQuery {
  /** `true` to include archived accounts. */
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  includeArchived?: boolean;
}
