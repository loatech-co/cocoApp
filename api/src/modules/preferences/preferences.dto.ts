import { IsBoolean, IsOptional } from 'class-validator';

/**
 * One field per preference, not a free-form object.
 *
 * With `whitelist` and `forbidNonWhitelisted` on the ValidationPipe, this
 * rejects outright any key that is not declared — no need to check it by hand
 * in the service.
 */
export class UpdatePreferencesDto {
  @IsOptional()
  @IsBoolean()
  cuentas_habilitadas?: boolean;
}
