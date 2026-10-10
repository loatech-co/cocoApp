import { Transform } from 'class-transformer';
import { IsEmail, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

import { MAX_LENGTH, MIN_LENGTH } from '../../password.policy';

/**
 * The DTOs check SHAPE, not strength: the full password policy (composition,
 * relation to personal data and the check against breaches) lives in
 * PasswordService, so it is a single source of truth and covered by tests.
 */

/**
 * Normalises the email BEFORE validating it.
 *
 * Without this, ` Ana@X.com ` —what any autocomplete or copy-paste
 * produces— would fail with "invalid format" and the person would have no way
 * of knowing the problem is an invisible space. It also makes sure the same
 * address written two ways is always the same account.
 */
const NormalizeEmail = (): PropertyDecorator =>
  Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  );

export class RegisterDto {
  @NormalizeEmail()
  @IsEmail({}, { message: 'El correo no tiene un formato válido.' })
  @MaxLength(255)
  email!: string;

  @IsString()
  @MinLength(MIN_LENGTH, {
    message: `La contraseña debe tener al menos ${MIN_LENGTH} caracteres.`,
  })
  @MaxLength(MAX_LENGTH)
  password!: string;

  @IsString()
  @MinLength(2, { message: 'El nombre es obligatorio.' })
  @MaxLength(255)
  displayName!: string;
}

export class LoginDto {
  @NormalizeEmail()
  @IsEmail({}, { message: 'El correo no tiene un formato válido.' })
  @MaxLength(255)
  email!: string;

  // No MinLength: requiring a length here would reveal the policy to someone
  // who is only trying to sign in, and an old, short password would fail with
  // a message other than "wrong credentials".
  @IsString()
  @MaxLength(MAX_LENGTH)
  password!: string;
}

export class ChangePasswordDto {
  @IsString()
  @MaxLength(MAX_LENGTH)
  currentPassword!: string;

  @IsString()
  @MinLength(MIN_LENGTH)
  @MaxLength(MAX_LENGTH)
  newPassword!: string;
}

/**
 * Body of refresh and logout. Only native clients (`X-Coco-Client: native`)
 * send it; the web's refresh token travels in its httpOnly cookie.
 */
export class RefreshInput {
  @IsOptional()
  @IsString()
  @MaxLength(4096)
  refreshToken?: string;
}
