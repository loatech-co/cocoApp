import { Injectable } from '@nestjs/common';

import type { SearchableNode } from '@coco/receipt-parser';

import { DUPLICATING_SOURCES, twinCriteria, twinVerdict, type NewCapture } from './duplicates';
import {
  interpret,
  summaryOf,
  type InterpretedClassification,
  type Interpreted,
} from './interpret';
import {
  classificationOf,
  interpretationOf,
  todayInBogota,
  categoryIdToSave,
  notesOf,
  type Capture,
  type Interpretation,
} from './interpretation.domain';
import type { CaptureBodyDto, InterpretBodyDto } from './interpretation.dto';
import { nest } from '../../common/categories/categories.tree';
import { DuplicateError, NotFoundError, ValidationError } from '../../common/errors/domain-error';
import { CategoryLookupService } from '../categories/category-lookup.service';
import { CategorizationService } from '../categorization/categorization.service';
import { LedgerService } from '../transactions/ledger.service';
import { TransactionsService, type Transaction } from '../transactions/transactions.service';

/**
 * El único cerebro: interpreta, clasifica, detecta duplicados y registra.
 *
 * ── Dos puertas, una cabeza ─────────────────────────────────────────────────
 * `interpretar` no escribe nada: es para rellenar una ficha antes de confirmar.
 * `capturar` hace todo de una —interpretar, clasificar, buscar la otra cara
 * del mismo pago y crear— para quien no tiene una ficha delante: una acción
 * de Atajos en segundo plano, un SMS que llega.
 *
 * La decisión en sí está en `interpretar()` y `decidirDuplicado()`, que son
 * funciones puras; aquí solo se les trae lo que necesitan de la base y se
 * escribe lo que digan.
 */
@Injectable()
export class InterpretationService {
  constructor(
    private readonly ledger: LedgerService,
    private readonly categories: CategoryLookupService,
    private readonly categorization: CategorizationService,
    private readonly transactions: TransactionsService,
  ) {}

  async interpret(userId: bigint, dto: InterpretBodyDto): Promise<Interpretation> {
    const interpreted = await this.read(userId, dto);
    return interpretationOf(interpreted);
  }

  async capture(userId: bigint, dto: CaptureBodyDto): Promise<Capture> {
    /*
      ── Idempotencia, antes que nada ────────────────────────────────────────
      Un cliente que reintenta manda el mismo `external_ref`. Si ya está, se
      devuelve lo que hay y no se interpreta ni se crea nada: la respuesta es
      la misma que recibió —o no llegó a recibir— la primera vez.
    */
    const existingId = await this.ledger.findIdByExternalRef(userId, dto.external_ref);
    if (existingId !== null) return this.alreadyRecorded(userId, existingId, dto, true, false);

    /*
      ── Lo elegido manda ────────────────────────────────────────────────────
      Si la persona ya eligió el concepto en el formulario rápido, el motor no
      tiene nada que proponer: se comprueba que lo elegido sea suyo y sirva
      para clasificar, y se guarda tal cual. Se resuelve ANTES de interpretar
      para que un id malo responda 422 sin gastar una lectura del árbol.
    */
    const chosen =
      dto.category_id === undefined
        ? null
        : await this.chosenClassification(userId, BigInt(dto.category_id));
    const interpreted = await this.read(userId, dto, chosen);
    const capturedAt = dto.captured_at ? new Date(dto.captured_at) : new Date();

    const incoming: NewCapture = {
      source: dto.source,
      // Sin fecha legible, la del momento de la captura: un gasto necesita un
      // día, y el de la captura es la mejor aproximación. Queda marcado.
      date: interpreted.date ?? capturedAt.toISOString().slice(0, 10),
      // Sin monto, cero y marcado: Wallet a veces agota su espera y manda la
      // transacción sin valor. Perderla sería peor que registrarla en cero
      // para que alguien le ponga la cifra.
      amount: interpreted.amount ?? '0',
      capturedAt,
      rawText: dto.texto ?? null,
      merchant: interpreted.merchant,
      description: interpreted.description,
    };

    return this.record(userId, dto, incoming, interpreted);
  }

  /*
    ── La otra cara del mismo pago ─────────────────────────────────────────
    Solo desde Wallet o SMS. La búsqueda de la gemela y la escritura van en
    UNA transacción, bajo un candado por persona y monto (`LedgerService.
    createUnlessTwin`): si Wallet y el SMS llegan a la vez, el segundo espera
    al primero y lo encuentra. Exacto: se enriquece la que había y se
    devuelve. Parcial: se crea, pero marcada. Decide la función pura.
  */
  private async record(
    userId: bigint,
    dto: CaptureBodyDto,
    incoming: NewCapture,
    interpreted: Interpreted,
  ): Promise<Capture> {
    const newTransaction = newTransactionOf(dto, incoming, interpreted);
    try {
      if (!DUPLICATING_SOURCES.has(dto.source)) {
        return createdCapture(await this.transactions.create(userId, newTransaction), interpreted);
      }
      const prepared = await this.transactions.prepareCreate(userId, newTransaction);
      const outcome = await this.ledger.createUnlessTwin(
        prepared,
        twinCriteria(userId, dto.source, incoming),
        (rows) => twinVerdict(incoming, rows),
      );
      if (outcome.kind === 'merged') {
        return await this.alreadyRecorded(
          userId,
          outcome.id,
          dto,
          false,
          true,
          interpreted.classification,
        );
      }
      return createdCapture(await this.transactions.get(userId, outcome.id), interpreted);
    } catch (error) {
      /*
        Dos capturas con el mismo `external_ref` a la vez —dos reintentos que
        se cruzan— pasan las dos la comprobación de arriba y llegan las dos a
        insertar. La segunda choca con el índice único: es la idempotencia
        haciendo su trabajo en la base, y se contesta igual que si hubiera
        estado desde el principio.
      */
      if (!(error instanceof DuplicateError)) throw error;
      const existingId = await this.ledger.findIdByExternalRef(userId, dto.external_ref);
      // Parity with the former findFirstOrThrow: a vanished row is a 404.
      if (existingId === null) throw new NotFoundError('El recurso no existe.');
      return this.alreadyRecorded(userId, existingId, dto, true, false, interpreted.classification);
    }
  }

  // ── Plomería ───────────────────────────────────────────────────────────────

  private async read(
    userId: bigint,
    dto: InterpretBodyDto,
    chosen: InterpretedClassification | null = null,
  ): Promise<Interpreted> {
    const amount = dto.monto?.replace(',', '.');
    if (!dto.texto?.trim() && !dto.comercio?.trim()) {
      /*
        Un gasto anotado a mano en el teléfono —concepto y monto, nada más— no
        tiene nada que interpretar: no hay texto del que sacar un comercio ni
        una fecha, y la clasificación ya está decidida. Se arma el resultado
        directo sin pasar por `interpretar()`, que seguiría buscando en vacío.
        Sin monto o sin elección, sí falta algo que leer.
      */
      if (chosen && amount !== undefined) {
        return {
          amount,
          date: dto.fecha ?? null,
          merchant: null,
          description: null,
          classification: chosen,
          needsReview: chosen.certainty !== 'alta',
        };
      }
      throw new ValidationError('Hace falta un texto o, al menos, el comercio.', {
        code: 'interpretation_needs_text',
      });
    }

    const [tree, history] = await Promise.all([
      this.treeOf(userId),
      // El historial se consulta con lo más parecido a una descripción: el
      // comercio si viene; si no, el texto. Un SMS entero trae mucho ruido de
      // banco y el historial lo nota en la confianza, que es lo correcto.
      this.categorization.suggestFor(userId, dto.comercio?.trim() || dto.texto?.trim() || ''),
    ]);

    const parsed = interpret(
      {
        text: dto.texto,
        merchant: dto.comercio,
        amount,
        date: dto.fecha,
        fileName: dto.nombre_de_archivo,
        period: dto.periodo,
      },
      {
        tree,
        history: history
          ? { categoryId: String(history.categoryId), confidence: history.confidence }
          : null,
        today: todayInBogota(),
      },
    );
    if (!chosen) return parsed;

    // Lo que el motor entendió del texto —monto, fecha, comercio— se queda;
    // lo que propuso como clasificación, no: la persona ya lo decidió. Y lo
    // que marca para revisar es solo la elección a medias (una categoría sin
    // concepto), no la duda del motor, que aquí no cuenta.
    return { ...parsed, classification: chosen, needsReview: chosen.certainty !== 'alta' };
  }

  /**
   * La clasificación que la persona eligió a mano, con la misma forma que la
   * que propone el motor para que el resto del camino no distinga.
   *
   * Un concepto (profundidad 3) es certeza alta: queda clasificado del todo.
   * Una categoría (profundidad 2) es media y por revisar: está en el sitio
   * correcto a medias, igual que cuando el motor solo llega hasta ahí y que
   * en el buscador de la web, que ofrece las dos. Un centro de costos no
   * clasifica nada —los movimientos viven tres niveles más abajo— y lo
   * archivado ya no vuelve, así que ninguno de los dos se acepta.
   */
  private async chosenClassification(
    userId: bigint,
    id: bigint,
  ): Promise<InterpretedClassification> {
    const row = await this.categories.findChosen(userId, id);
    // La misma respuesta para «no existe» y «no es tuya»: decir cuál de las
    // dos es revelaría ids ajenos.
    if (!row)
      throw new ValidationError('La categoría indicada no existe o no es tuya.', {
        code: 'category_not_owned',
      });
    if (row.isArchived)
      throw new ValidationError('Ese concepto está archivado.', { code: 'concept_archived' });
    if (!row.parent)
      throw new ValidationError('Un centro de costos no clasifica nada: elige un concepto.', {
        code: 'cost_center_cannot_classify',
      });

    const isConcept = row.parent.parentId !== null;
    return {
      certainty: isConcept ? 'alta' : 'media',
      source: null,
      conceptId: isConcept ? row.id.toString() : null,
      categoryId: isConcept ? row.parent.id.toString() : row.id.toString(),
      name: row.name,
      candidates: [],
      reason: 'Lo eligió la persona.',
    };
  }

  /**
   * El árbol de la persona, con ids como cadenas, sin lo archivado.
   *
   * Archivado quiere decir «esto ya no vuelve»: proponerlo sería clasificar
   * un gasto de hoy en el gimnasio que se dio de baja.
   */
  private async treeOf(userId: bigint): Promise<SearchableNode[]> {
    const rows = await this.categories.findSearchable(userId);
    const toNode = (f: {
      id: bigint;
      name: string;
      keywords: string[];
      children: unknown[];
    }): SearchableNode => ({
      id: f.id.toString(),
      name: f.name,
      keywords: f.keywords,
      children: (f.children as (typeof f)[]).map(toNode),
    });
    return nest(rows).map(toNode);
  }

  private async alreadyRecorded(
    userId: bigint,
    id: bigint,
    dto: CaptureBodyDto,
    isDuplicate: boolean,
    isMerged: boolean,
    classification?: InterpretedClassification,
  ): Promise<Capture> {
    const transaction = await this.transactions.get(userId, id);
    const shown: InterpretedClassification = classification ??
      // De una repetida no se vuelve a interpretar: lo que importa es lo que
      // quedó guardado, que es lo que se le dice.
      {
        certainty: transaction.categoryId === null ? 'ninguna' : 'alta',
        source: null,
        conceptId: transaction.categoryId === null ? null : transaction.categoryId.toString(),
        categoryId: null,
        name: null,
        candidates: [],
        reason: `Ya estaba registrado con la referencia ${dto.external_ref}.`,
      };
    return {
      transaction,
      classification: classificationOf(shown),
      summary: isMerged
        ? `Era el mismo pago: ${summaryOf(transaction.amount, shown).replace(/^Registrado: /, '')}`
        : summaryOf(transaction.amount, shown),
      isDuplicate,
      isMerged,
    };
  }
}

/** Lo que `TransactionsService` pide para crear, sin importar su DTO (los módulos hablan por servicios). */
type NewTransaction = Parameters<TransactionsService['create']>[1];

/** Lo que se escribe de una captura, como lo pide `TransactionsService`. */
function newTransactionOf(
  dto: CaptureBodyDto,
  incoming: NewCapture,
  interpreted: Interpreted,
): NewTransaction {
  return {
    date: incoming.date,
    amount: incoming.amount,
    type: 'expense',
    category_id: categoryIdToSave(interpreted.classification),
    description: interpreted.description ?? undefined,
    merchant: interpreted.merchant ?? undefined,
    notes: notesOf(dto.nota, interpreted.amount),
    external_ref: dto.external_ref,
    source: dto.source,
    raw_text: dto.texto ?? null,
    captured_at: incoming.capturedAt.toISOString(),
    por_revisar: interpreted.needsReview,
  };
}

function createdCapture(created: Transaction, interpreted: Interpreted): Capture {
  return {
    transaction: created,
    classification: classificationOf(interpreted.classification),
    summary: summaryOf(interpreted.amount, interpreted.classification),
    isDuplicate: false,
    isMerged: false,
  };
}
