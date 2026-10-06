import { Injectable } from '@nestjs/common';

import { flagOfPreferenceKey, type FlagName } from '@coco/flags';

import {
  ACCOUNTS_ENABLED,
  withDefaults,
  preferencesOf,
  type StoredPreferences,
  type Preferences,
} from './preferences';
import type { UpdatePreferencesDto } from './preferences.dto';
import { PreferencesRepository } from './preferences.repository';
import type { Prisma } from '../../generated/prisma/client';

@Injectable()
export class PreferencesService {
  constructor(private readonly repository: PreferencesRepository) {}

  async read(userId: bigint): Promise<Preferences> {
    return preferencesOf(await this.saved(userId));
  }

  /** Guarda solo lo que venga en el DTO. */
  async update(userId: bigint, changes: UpdatePreferencesDto): Promise<Preferences> {
    const entries = Object.entries(changes)
      .filter(([, value]) => value !== undefined)
      .map(([key, value]) => [key, value as Prisma.InputJsonValue] as const);

    if (entries.length > 0) {
      await this.repository.upsertMany(userId, entries);
    }

    return this.read(userId);
  }

  /**
   * Atajo para el resto de la aplicación.
   *
   * Lo consultan el dashboard y el módulo de movimientos para saber si tiene
   * sentido hablar de saldos. Vive aquí para que la respuesta a "¿este usuario
   * lleva cuentas?" tenga una sola fuente.
   */
  async tracksAccounts(userId: bigint): Promise<boolean> {
    return (await this.saved(userId))[ACCOUNTS_ENABLED];
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
  private async saved(userId: bigint): Promise<StoredPreferences> {
    return withDefaults(await this.repository.findByUser(userId));
  }
}
