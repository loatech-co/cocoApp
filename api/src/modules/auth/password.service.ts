import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'node:crypto';

import { derivesFromPersonalData, evaluatePolicy } from './password.policy';
import { ValidationError } from '../../common/errors/domain-error';

/**
 * Política de contraseñas.
 *
 * ── Por qué sigue existiendo tras migrar a Supabase Auth ────────────────────
 * Supabase guarda y verifica las credenciales, pero su política por defecto es
 * mínima: una longitud y poco más. Esta se mantiene porque comprueba tres
 * cosas que la suya no: longitud y composición propias, que la contraseña no
 * derive del nombre o del correo de la persona, y —la que más importa— que no
 * aparezca en filtraciones públicas conocidas.
 *
 * Se valida ANTES de mandar la contraseña a Supabase. Si no pasa, Supabase ni
 * se entera: la cuenta no llega a crearse con una contraseña que ya está en un
 * diccionario de ataque.
 *
 * Lo que ya NO vive aquí es el hasheo. Las credenciales son de Supabase y esta
 * clase no toca ni un hash: aquí no hay argon2, ni señuelos de tiempo, ni nada
 * que verificar.
 */
@Injectable()
export class PasswordService {
  private readonly logger = new Logger(PasswordService.name);
  private readonly checkBreaches: boolean;

  constructor(config: ConfigService) {
    // Se puede apagar para entornos sin salida a internet (CI, pruebas).
    this.checkBreaches = config.get<string>('CHECK_BREACHED_PASSWORDS', 'true') !== 'false';
  }

  /**
   * Valida una contraseña candidata contra las tres capas: composición,
   * relación con los datos de la cuenta, y filtraciones conocidas.
   */
  async requireStrong(
    password: string,
    personal: { email?: string | undefined; displayName?: string | undefined } = {},
  ): Promise<void> {
    const { isValid, problems } = evaluatePolicy(password);

    if (derivesFromPersonalData(password, personal)) {
      problems.push('No puede contener tu nombre ni tu correo.');
    }

    if (isValid && problems.length === 0 && (await this.appearsInBreaches(password))) {
      problems.push('Esta contraseña aparece en filtraciones públicas conocidas. Elige otra.');
    }

    if (problems.length > 0) {
      throw new ValidationError('La contraseña no cumple los requisitos.', {
        code: 'weak_password',
        details: problems.map((problem) => ({ field: 'password', message: problem })),
      });
    }
  }

  /**
   * Consulta Have I Been Pwned con k-anonimato.
   *
   * Solo viajan los 5 primeros caracteres del SHA-1: el servicio devuelve todos
   * los sufijos que empiezan así (cientos) y la comparación se hace aquí. La
   * contraseña —ni su hash completo— sale nunca de este proceso.
   *
   * Falla ABIERTO a propósito: si el servicio está caído, no se bloquea el
   * registro. Perder disponibilidad por un chequeo complementario sería peor
   * que aceptar una contraseña que ya pasó las otras dos capas.
   */
  private async appearsInBreaches(password: string): Promise<boolean> {
    if (!this.checkBreaches) return false;

    const sha1 = createHash('sha1').update(password).digest('hex').toUpperCase();
    const prefix = sha1.slice(0, 5);
    const suffix = sha1.slice(5);

    try {
      const response = await fetch(`https://api.pwnedpasswords.com/range/${prefix}`, {
        headers: { 'Add-Padding': 'true' },
        signal: AbortSignal.timeout(3000),
      });

      if (!response.ok) return false;

      const body = await response.text();
      return body.split('\n').some((line) => line.split(':')[0]?.trim().toUpperCase() === suffix);
    } catch {
      this.logger.warn('No se pudo consultar la base de contraseñas filtradas; se omite.');
      return false;
    }
  }
}
