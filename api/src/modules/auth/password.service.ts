import { Injectable, Logger, UnprocessableEntityException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'node:crypto';

import { derivaDeDatosPersonales, evaluarPolitica } from './password.policy';

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
  private readonly verificarFiltradas: boolean;

  constructor(config: ConfigService) {
    // Se puede apagar para entornos sin salida a internet (CI, pruebas).
    this.verificarFiltradas =
      config.get<string>('CHECK_BREACHED_PASSWORDS', 'true') !== 'false';
  }




  /**
   * Valida una contraseña candidata contra las tres capas: composición,
   * relación con los datos de la cuenta, y filtraciones conocidas.
   */
  async exigirQueSeaFuerte(
    password: string,
    datos: { email?: string; displayName?: string } = {},
  ): Promise<void> {
    const { valida, problemas } = evaluarPolitica(password);

    if (derivaDeDatosPersonales(password, datos)) {
      problemas.push('No puede contener tu nombre ni tu correo.');
    }

    if (valida && problemas.length === 0 && (await this.apareceEnFiltraciones(password))) {
      problemas.push(
        'Esta contraseña aparece en filtraciones públicas conocidas. Elige otra.',
      );
    }

    if (problemas.length > 0) {
      throw new UnprocessableEntityException({
        message: 'La contraseña no cumple los requisitos.',
        details: problemas.map((problema) => ({ field: 'password', message: problema })),
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
  private async apareceEnFiltraciones(password: string): Promise<boolean> {
    if (!this.verificarFiltradas) return false;

    const sha1 = createHash('sha1').update(password).digest('hex').toUpperCase();
    const prefijo = sha1.slice(0, 5);
    const sufijo = sha1.slice(5);

    try {
      const respuesta = await fetch(`https://api.pwnedpasswords.com/range/${prefijo}`, {
        headers: { 'Add-Padding': 'true' },
        signal: AbortSignal.timeout(3000),
      });

      if (!respuesta.ok) return false;

      const cuerpo = await respuesta.text();
      return cuerpo
        .split('\n')
        .some((linea) => linea.split(':')[0]?.trim().toUpperCase() === sufijo);
    } catch {
      this.logger.warn('No se pudo consultar la base de contraseñas filtradas; se omite.');
      return false;
    }
  }
}
