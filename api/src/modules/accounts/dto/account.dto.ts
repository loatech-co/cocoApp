import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

import { IsMoney } from '../../../common/validation/is-money.decorator';
import { AccountType } from '../../../generated/prisma/client';

/**
 * Ningún DTO expone `userId`: el ValidationPipe corre con
 * `forbidNonWhitelisted`, así que si alguien intenta colar uno en el body, la
 * petición muere antes de llegar al servicio.
 */
export class CreateAccountDto {
  @IsString()
  @MinLength(1, { message: 'El nombre no puede estar vacío.' })
  @MaxLength(255)
  name!: string;

  @IsEnum(AccountType, { message: 'El tipo de cuenta no es válido.' })
  type!: AccountType;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  institution?: string;

  @IsOptional()
  @Matches(/^\d{4}$/, { message: 'last4 deben ser exactamente 4 dígitos.' })
  last4?: string;

  /** Solo aplica a `type: 'credit'`. El servicio valida esa coherencia. */
  @IsOptional()
  @IsMoney()
  credit_limit?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(31)
  cutoff_day?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(31)
  payment_day?: number;

  /** Punto de partida del saldo derivado. Puede ser negativo (sobregiro). */
  @IsOptional()
  @IsMoney()
  opening_balance?: string;
}

export class UpdateAccountDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  name?: string;

  @IsOptional()
  @IsEnum(AccountType)
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
  credit_limit?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(31)
  cutoff_day?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(31)
  payment_day?: number;

  @IsOptional()
  @IsMoney()
  opening_balance?: string;

  /** Archivar es la operación por defecto: nunca se borra historial. */
  @IsOptional()
  @IsBoolean()
  is_archived?: boolean;
}

export class ListAccountsQueryDto {
  @IsOptional()
  @Type(() => Boolean)
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  include_archived?: boolean;
}
