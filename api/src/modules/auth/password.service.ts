import { hash, verify, Algorithm } from '@node-rs/argon2';
import { Injectable, Logger, UnprocessableEntityException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'node:crypto';

import { derivaDeDatosPersonales, evaluarPolitica } from './password.policy';

/**
 * Parámetros de argon2id recomendados por OWASP (Password Storage Cheat Sheet).
 *
 * argon2id y no bcrypt: es el ganador del Password Hashing Competition, resiste
 * ataques con GPU y con hardware dedicado gracias al costo en MEMORIA, y no
 * tiene el límite de 72 bytes de bcrypt.
 *
 * El costo de memoria es lo que hace caro el ataque masivo: 19 MiB por intento
 * significa que una GPU no puede paralelizar miles de hashes a la vez.
 */
const ARGON2 = {
  algorithm: Algorithm.Argon2id,
  memoryCost: 19_456, // KiB = 19 MiB
  timeCost: 2,
  parallelism: 1,
} as const;

/**
 * Hash de una contraseña inventada, para gastar el mismo tiempo cuando el
 * correo no existe. Sin esto, el login respondería más rápido ante un correo
 * desconocido y cualquiera podría averiguar qué direcciones tienen cuenta
 * midiendo tiempos.
 */
const SENUELO =
  '$argon2id$v=19$m=19456,t=2,p=1$wPo9duf/zbMJN4BsNLUqAg$MISlu5iYDV8+sKRW9gMbJvqHzUzSEpBl7Ni1uStMmh0';

@Injectable()
export class PasswordService {
  private readonly logger = new Logger(PasswordService.name);
  private readonly verificarFiltradas: boolean;

  constructor(config: ConfigService) {
    // Se puede apagar para entornos sin salida a internet (CI, pruebas).
    this.verificarFiltradas =
      config.get<string>('CHECK_BREACHED_PASSWORDS', 'true') !== 'false';
  }

  async hashear(password: string): Promise<string> {
    return hash(password, ARGON2);
  }

  /**
   * Verifica una contraseña. Devuelve `false` en vez de lanzar si el hash está
   * corrupto: un registro dañado no debe tumbar el login de todos.
   */
  async verificar(hashAlmacenado: string, password: string): Promise<boolean> {
    try {
      return await verify(hashAlmacenado, password, ARGON2);
    } catch {
      return false;
    }
  }

  /**
   * Gasta el mismo trabajo que una verificación real contra un hash señuelo.
   * Se llama cuando el correo no existe, para que el tiempo de respuesta no
   * distinga "no existe" de "contraseña incorrecta".
   */
  async gastarTiempoEquivalente(password: string): Promise<void> {
    try {
      await verify(SENUELO, password, ARGON2);
    } catch {
      // Da igual el resultado: lo único que importa es haber gastado el tiempo.
    }
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
