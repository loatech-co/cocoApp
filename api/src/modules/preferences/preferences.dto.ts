import { IsBoolean, IsOptional } from 'class-validator';

/**
 * Un campo por preferencia, no un objeto libre.
 *
 * Con `whitelist` y `forbidNonWhitelisted` en el ValidationPipe, esto rechaza
 * de plano cualquier clave que no esté declarada — no hace falta validarlo a
 * mano en el servicio.
 */
export class UpdatePreferencesDto {
  @IsOptional()
  @IsBoolean()
  cuentas_habilitadas?: boolean;
}
