import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';

import { CUENTAS_HABILITADAS, combinarConDefectos, type Preferencias } from './preferences';
import type { UpdatePreferencesDto } from './preferences.dto';
import { PreferencesRepository } from './preferences.repository';

@Injectable()
export class PreferencesService {
  constructor(private readonly repository: PreferencesRepository) {}

  async leer(userId: bigint): Promise<Preferencias> {
    return combinarConDefectos(await this.repository.findByUser(userId));
  }

  /** Guarda solo lo que venga en el DTO. */
  async actualizar(userId: bigint, cambios: UpdatePreferencesDto): Promise<Preferencias> {
    const entradas = Object.entries(cambios)
      .filter(([, valor]) => valor !== undefined)
      .map(([clave, valor]) => [clave, valor as Prisma.InputJsonValue] as const);

    if (entradas.length > 0) {
      await this.repository.upsertMany(userId, entradas);
    }

    return this.leer(userId);
  }

  /**
   * Atajo para el resto de la aplicación.
   *
   * Lo consultan el dashboard y el módulo de movimientos para saber si tiene
   * sentido hablar de saldos. Vive aquí para que la respuesta a "¿este usuario
   * lleva cuentas?" tenga una sola fuente.
   */
  async llevaCuentas(userId: bigint): Promise<boolean> {
    return (await this.leer(userId))[CUENTAS_HABILITADAS];
  }
}
