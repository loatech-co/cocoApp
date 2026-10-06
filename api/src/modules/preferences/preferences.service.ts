import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';

import { flagOfPreferenceKey, type FlagName } from '@coco/flags';

import {
  CUENTAS_HABILITADAS,
  combinarConDefectos,
  preferencesOf,
  type Preferencias,
  type Preferences,
} from './preferences';
import type { UpdatePreferencesDto } from './preferences.dto';
import { PreferencesRepository } from './preferences.repository';

@Injectable()
export class PreferencesService {
  constructor(private readonly repository: PreferencesRepository) {}

  async leer(userId: bigint): Promise<Preferences> {
    return preferencesOf(await this.guardadas(userId));
  }

  /** Guarda solo lo que venga en el DTO. */
  async actualizar(userId: bigint, cambios: UpdatePreferencesDto): Promise<Preferences> {
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
    return (await this.guardadas(userId))[CUENTAS_HABILITADAS];
  }

  /**
   * This user's own feature flag values: rows `feature:<name>` holding a
   * boolean (step 7.8). The flags module reads them through here because this
   * module owns `user_preferences`. They are not part of `Preferencias` and the
   * DTO does not accept them: a person cannot turn a flag on for themselves.
   */
  async featureOverrides(userId: bigint): Promise<ReadonlyMap<FlagName, boolean>> {
    const overrides = new Map<FlagName, boolean>();
    for (const row of await this.repository.findByUser(userId)) {
      const name = flagOfPreferenceKey(row.prefKey);
      if (name !== null && typeof row.prefValue === 'boolean') overrides.set(name, row.prefValue);
    }
    return overrides;
  }

  /** Lo guardado, por clave de la tabla, con los valores por defecto. */
  private async guardadas(userId: bigint): Promise<Preferencias> {
    return combinarConDefectos(await this.repository.findByUser(userId));
  }
}
