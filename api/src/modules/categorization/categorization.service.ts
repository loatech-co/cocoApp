import { Injectable } from '@nestjs/common';

import {
  learnablePattern,
  suggestCategory,
  type HistoryEntry,
  type CategoryRule,
  type SuggestedCategory,
} from './categorization';
import { CategorizationRepository } from './categorization.repository';
import { normalizeDescription } from './description';
import { ValidationError } from '../../common/errors/domain-error';
import { SUGGESTION_REASON, type English } from '../../common/vocabulary';
import { CategoryLookupService } from '../categories/category-lookup.service';
import { LedgerService } from '../transactions/ledger.service';

/**
 * Cuántos movimientos ya categorizados se leen para aprender.
 *
 * Suficientes para que el patrón de alguien se note, y bastante menos que "todo
 * el historial": traer diez mil filas en cada sugerencia sería absurdo, y los
 * movimientos recientes describen mejor cómo organiza sus finanzas HOY.
 */
const HISTORY_SIZE = 400;

/**
 * Prioridad con la que nacen las reglas sembradas por defecto, frente a las que
 * la persona crea o confirma. La diferencia no es decorativa: decide quién gana
 * cuando dos reglas coinciden, y con qué confianza se muestra la sugerencia.
 */
const SEEDED_PRIORITY = 0;
const LEARNED_PRIORITY = 10;

/** A suggested category, as the service hands it out (the domain). */
export interface Suggestion {
  categoryId: number;
  /** 0–100. */
  confidence: number;
  reason: English<typeof SUGGESTION_REASON>;
}

/** Whether confirming a classification left a rule behind. */
export interface Learning {
  learned: boolean;
}

@Injectable()
export class CategorizationService {
  constructor(
    private readonly repository: CategorizationRepository,
    private readonly ledger: LedgerService,
    private readonly categories: CategoryLookupService,
  ) {}

  /**
   * Sugiere categoría para una descripción suelta (la captura rápida).
   *
   * Para varias descripciones a la vez —una importación entera— se usa
   * `prepararContexto` + `sugerirParaLote`: leer el historial una sola vez en
   * lugar de una por fila.
   */
  async suggestFor(userId: bigint, description: string): Promise<Suggestion | null> {
    const context = await this.loadContext(userId);
    return suggestionOf(suggestCategory(description, context));
  }

  /**
   * The suggestion for what is being typed in the quick capture, or `null`
   * when there is no text yet: suggesting wrong is worse than not suggesting.
   */
  async suggestForQuery(
    userId: bigint,
    description: string | undefined,
  ): Promise<Suggestion | null> {
    return description?.trim() ? this.suggestFor(userId, description) : null;
  }

  /**
   * Lee de una sola vez todo lo que hace falta para categorizar.
   *
   * Se separa a propósito: una importación de cuarenta filas debe costar dos
   * consultas, no ochenta.
   */
  async loadContext(userId: bigint): Promise<{
    history: HistoryEntry[];
    rules: CategoryRule[];
  }> {
    const [transactions, rules] = await Promise.all([
      this.ledger.findCategorizedHistory(userId, HISTORY_SIZE),
      this.repository.findRules(userId),
    ]);

    return {
      // El filtro de la consulta garantiza que no hay nulos; `flatMap` se lo
      // demuestra a TypeScript sin quitar nada.
      history: transactions.flatMap((transaction) =>
        transaction.categoryId === null
          ? []
          : [{ description: transaction.description, categoryId: transaction.categoryId }],
      ),
      rules: rules.map((rule) => ({
        ...rule,
        isSeeded: rule.priority === SEEDED_PRIORITY,
      })),
    };
  }

  /**
   * Registra que una sugerencia se aceptó, creando o reforzando una regla.
   *
   * Es lo que hace que el sistema mejore con el uso sin pedirle nada a nadie:
   * la próxima importación acertará más porque esta se corrigió.
   */
  async learnFrom(userId: bigint, description: string, categoryId: bigint): Promise<boolean> {
    const pattern = learnablePattern(description, normalizeDescription);
    if (!pattern) return false;

    await this.repository.upsertRule(userId, pattern, categoryId, LEARNED_PRIORITY);
    return true;
  }

  /**
   * Lo mismo, pero desde la ficha: comprueba antes que la categoría sea suya.
   *
   * `aprenderDe` confía en quien lo llama porque la importación ya validó sus
   * filas. Desde la ficha llega un `category_id` escrito por el cliente, y sin
   * esta comprobación alguien podría crear una regla que apunte a la categoría
   * de otra cuenta —inútil para él, pero una fila que no debería existir—.
   */
  async learnFromForm(userId: bigint, description: string, categoryId: bigint): Promise<Learning> {
    if (!(await this.categories.isOwn(userId, categoryId)))
      throw new ValidationError('Esa categoría no existe en tu cuenta.', {
        code: 'category_not_owned',
      });

    return { learned: await this.learnFrom(userId, description, categoryId) };
  }
}

function suggestionOf(suggested: SuggestedCategory | null): Suggestion | null {
  return suggested
    ? {
        categoryId: Number(suggested.categoryId),
        confidence: suggested.confidence,
        reason: suggested.reason,
      }
    : null;
}
