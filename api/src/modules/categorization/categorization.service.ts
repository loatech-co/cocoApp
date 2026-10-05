import { Injectable } from '@nestjs/common';

import {
  patronParaAprender,
  sugerirCategoria,
  type AntecedenteHistorico,
  type ReglaDeCategoria,
  type Sugerencia,
} from './categorization';
import { CategorizationRepository } from './categorization.repository';
import { normalizarDescripcion } from './description';
import { ValidationError } from '../../common/errors/domain-error';
import { CategoryLookupService } from '../categories/category-lookup.service';
import { LedgerService } from '../transactions/ledger.service';

/**
 * Cuántos movimientos ya categorizados se leen para aprender.
 *
 * Suficientes para que el patrón de alguien se note, y bastante menos que "todo
 * el historial": traer diez mil filas en cada sugerencia sería absurdo, y los
 * movimientos recientes describen mejor cómo organiza sus finanzas HOY.
 */
const ANTECEDENTES_A_LEER = 400;

/**
 * Prioridad con la que nacen las reglas sembradas por defecto, frente a las que
 * la persona crea o confirma. La diferencia no es decorativa: decide quién gana
 * cuando dos reglas coinciden, y con qué confianza se muestra la sugerencia.
 */
const PRIORIDAD_SEMBRADA = 0;
const PRIORIDAD_APRENDIDA = 10;

export interface SugerenciaView {
  category_id: number;
  confidence: number;
  reason: Sugerencia['motivo'];
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
  async sugerirPara(userId: bigint, descripcion: string): Promise<SugerenciaView | null> {
    const contexto = await this.prepararContexto(userId);
    return aVista(sugerirCategoria(descripcion, contexto));
  }

  /**
   * The suggestion for what is being typed in the quick capture, or `null`
   * when there is no text yet: suggesting wrong is worse than not suggesting.
   */
  async suggestForQuery(
    userId: bigint,
    descripcion: string | undefined,
  ): Promise<SugerenciaView | null> {
    return descripcion?.trim() ? this.sugerirPara(userId, descripcion) : null;
  }

  /**
   * Lee de una sola vez todo lo que hace falta para categorizar.
   *
   * Se separa a propósito: una importación de cuarenta filas debe costar dos
   * consultas, no ochenta.
   */
  async prepararContexto(userId: bigint): Promise<{
    historial: AntecedenteHistorico[];
    reglas: ReglaDeCategoria[];
  }> {
    const [movimientos, reglas] = await Promise.all([
      this.ledger.findCategorizedHistory(userId, ANTECEDENTES_A_LEER),
      this.repository.findRules(userId),
    ]);

    return {
      // El filtro de la consulta garantiza que no hay nulos; `flatMap` se lo
      // demuestra a TypeScript sin quitar nada.
      historial: movimientos.flatMap((movimiento) =>
        movimiento.categoryId === null
          ? []
          : [{ description: movimiento.description, categoryId: movimiento.categoryId }],
      ),
      reglas: reglas.map((regla) => ({
        ...regla,
        sembrada: regla.priority === PRIORIDAD_SEMBRADA,
      })),
    };
  }

  /**
   * Registra que una sugerencia se aceptó, creando o reforzando una regla.
   *
   * Es lo que hace que el sistema mejore con el uso sin pedirle nada a nadie:
   * la próxima importación acertará más porque esta se corrigió.
   */
  async aprenderDe(userId: bigint, descripcion: string, categoryId: bigint): Promise<boolean> {
    const patron = patronParaAprender(descripcion, normalizarDescripcion);
    if (!patron) return false;

    await this.repository.upsertRule(userId, patron, categoryId, PRIORIDAD_APRENDIDA);
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
  async aprenderDesdeLaFicha(
    userId: bigint,
    descripcion: string,
    categoryId: bigint,
  ): Promise<{ aprendido: boolean }> {
    if (!(await this.categories.isOwn(userId, categoryId)))
      throw new ValidationError('Esa categoría no existe en tu cuenta.');

    return { aprendido: await this.aprenderDe(userId, descripcion, categoryId) };
  }
}

function aVista(sugerencia: Sugerencia | null): SugerenciaView | null {
  return sugerencia
    ? {
        category_id: Number(sugerencia.categoryId),
        confidence: sugerencia.confidence,
        reason: sugerencia.motivo,
      }
    : null;
}
