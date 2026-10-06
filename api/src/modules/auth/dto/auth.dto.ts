import { Transform } from 'class-transformer';
import { IsEmail, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

import { MAX_LENGTH, MIN_LENGTH } from '../password.policy';

/**
 * Los DTO validan FORMA, no fortaleza: la política completa de contraseñas
 * (composición, relación con los datos personales y contraste contra
 * filtraciones) vive en PasswordService, para que sea una sola fuente de verdad
 * y esté cubierta por pruebas.
 */

/**
 * Normaliza el correo ANTES de validarlo.
 *
 * Sin esto, ` Gerardo@X.com ` —lo que produce cualquier autocompletado o un
 * copiar/pegar— fallaría con "formato inválido" y la persona no tendría forma
 * de saber que el problema es un espacio invisible. Además garantiza que la
 * misma dirección escrita de dos maneras sea siempre la misma cuenta.
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

  // Sin MinLength: exigir longitud aquí revelaría la política a quien solo
  // intenta entrar, y además haría que una contraseña vieja y corta fallara
  // con un mensaje distinto al de "credenciales incorrectas".
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
 * Lo que trae el cuerpo de `/auth/refresh` y `/auth/logout` cuando el cliente
 * es nativo. En la web el cuerpo va vacío y la credencial es la cookie.
 */
export class RefreshNativeDto {
  @IsOptional()
  @IsString()
  @MaxLength(4096)
  refresh_token?: string;
}
