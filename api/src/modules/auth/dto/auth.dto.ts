import { Transform } from 'class-transformer';
import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';
import { LONGITUD_MAXIMA, LONGITUD_MINIMA } from '../password.policy';

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
const NormalizarCorreo = (): PropertyDecorator =>
  Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  );

export class RegisterDto {
  @NormalizarCorreo()
  @IsEmail({}, { message: 'El correo no tiene un formato válido.' })
  @MaxLength(255)
  email!: string;

  @IsString()
  @MinLength(LONGITUD_MINIMA, {
    message: `La contraseña debe tener al menos ${LONGITUD_MINIMA} caracteres.`,
  })
  @MaxLength(LONGITUD_MAXIMA)
  password!: string;

  @IsString()
  @MinLength(2, { message: 'El nombre es obligatorio.' })
  @MaxLength(255)
  displayName!: string;
}

export class LoginDto {
  @NormalizarCorreo()
  @IsEmail({}, { message: 'El correo no tiene un formato válido.' })
  @MaxLength(255)
  email!: string;

  // Sin MinLength: exigir longitud aquí revelaría la política a quien solo
  // intenta entrar, y además haría que una contraseña vieja y corta fallara
  // con un mensaje distinto al de "credenciales incorrectas".
  @IsString()
  @MaxLength(LONGITUD_MAXIMA)
  password!: string;
}

export class ChangePasswordDto {
  @IsString()
  @MaxLength(LONGITUD_MAXIMA)
  currentPassword!: string;

  @IsString()
  @MinLength(LONGITUD_MINIMA)
  @MaxLength(LONGITUD_MAXIMA)
  newPassword!: string;
}
