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

  @IsOptional()
  @IsString()
  @MaxLength(255)
  institution?: string;

  @IsOptional()
  @Matches(/^\d{4}$/, { message: 'last4 deben ser exactamente 4 dígitos.' })
  last4?: string;

  @IsOptional()
  @IsMoney()
  creditLimit?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(31)
  cutoffDay?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(31)
  paymentDay?: number;

  @IsOptional()
  @IsMoney()
  openingBalance?: string;
}

export class UpdateAccountInput {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  name?: string;

  @IsOptional()
  @IsIn(ACCOUNT_TYPES)
  type?: AccountType;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  institution?: string;

  @IsOptional()
  @Matches(/^\d{4}$/)
  last4?: string;

  @IsOptional()
  @IsMoney()
  creditLimit?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(31)
  cutoffDay?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(31)
  paymentDay?: number;

  @IsOptional()
  @IsMoney()
  openingBalance?: string;

  @IsOptional()
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
