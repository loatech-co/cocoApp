import { Injectable } from '@nestjs/common';

import type { SearchableNode } from '@coco/receipt-parser';

import {
  ORIGENES_QUE_SE_DUPLICAN,
  criteriosDeGemela,
  veredictoDeGemela,
  type CapturaNueva,
} from './duplicados';
import type { CaptureBodyDto, InterpretBodyDto } from './interpretacion.dto';
import {
  interpretar,
  resumenDe,
  type ClasificacionInterpretada,
  type Interpretado,
} from './interpretar';
import {
  classificationOf,
  interpretationOf,
  hoyEnBogota,
  idParaGuardar,
  notasDe,
  type Capture,
  type Interpretation,
} from './interpretation.domain';
import { anidar } from '../../common/categories/categories.tree';
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
export class InterpretacionService {
  constructor(
    private readonly ledger: LedgerService,
    private readonly categories: CategoryLookupService,
    private readonly categorization: CategorizationService,
    private readonly transactions: TransactionsService,
  ) {}

  async interpretar(userId: bigint, dto: InterpretBodyDto): Promise<Interpretation> {
    const interpretado = await this.leer(userId, dto);
    return interpretationOf(interpretado);
  }

  async capturar(userId: bigint, dto: CaptureBodyDto): Promise<Capture> {
    /*
      ── Idempotencia, antes que nada ────────────────────────────────────────
      Un cliente que reintenta manda el mismo `external_ref`. Si ya está, se
      devuelve lo que hay y no se interpreta ni se crea nada: la respuesta es
      la misma que recibió —o no llegó a recibir— la primera vez.
    */
    const repetida = await this.ledger.findIdByExternalRef(userId, dto.external_ref);
    if (repetida !== null) return this.yaEstaba(userId, repetida, dto, true, false);

    /*
      ── Lo elegido manda ────────────────────────────────────────────────────
      Si la persona ya eligió el concepto en el formulario rápido, el motor no
      tiene nada que proponer: se comprueba que lo elegido sea suyo y sirva
      para clasificar, y se guarda tal cual. Se resuelve ANTES de interpretar
      para que un id malo responda 422 sin gastar una lectura del árbol.
    */
    const elegida =
      dto.category_id === undefined
        ? null
        : await this.clasificacionElegida(userId, BigInt(dto.category_id));
    const interpretado = await this.leer(userId, dto, elegida);
    const capturadaEn = dto.captured_at ? new Date(dto.captured_at) : new Date();

    const nueva: CapturaNueva = {
      source: dto.source,
      // Sin fecha legible, la del momento de la captura: un gasto necesita un
      // día, y el de la captura es la mejor aproximación. Queda marcado.
      date: interpretado.fecha ?? capturadaEn.toISOString().slice(0, 10),
      // Sin monto, cero y marcado: Wallet a veces agota su espera y manda la
      // transacción sin valor. Perderla sería peor que registrarla en cero
      // para que alguien le ponga la cifra.
      amount: interpretado.monto ?? '0',
      capturedAt: capturadaEn,
      rawText: dto.texto ?? null,
      merchant: interpretado.comercio,
      description: interpretado.descripcion,
    };

    return this.registrar(userId, dto, nueva, interpretado);
  }

  /*
    ── La otra cara del mismo pago ─────────────────────────────────────────
    Solo desde Wallet o SMS. La búsqueda de la gemela y la escritura van en
    UNA transacción, bajo un candado por persona y monto (`LedgerService.
    createUnlessTwin`): si Wallet y el SMS llegan a la vez, el segundo espera
    al primero y lo encuentra. Exacto: se enriquece la que había y se
    devuelve. Parcial: se crea, pero marcada. Decide la función pura.
  */
  private async registrar(
    userId: bigint,
    dto: CaptureBodyDto,
    nueva: CapturaNueva,
    interpretado: Interpretado,
  ): Promise<Capture> {
    const alta = altaDe(dto, nueva, interpretado);
    try {
      if (!ORIGENES_QUE_SE_DUPLICAN.has(dto.source)) {
        return creadaAVista(await this.transactions.crear(userId, alta), interpretado);
      }
      const lista = await this.transactions.prepararAlta(userId, alta);
      const destino = await this.ledger.createUnlessTwin(
        lista,
        criteriosDeGemela(userId, dto.source, nueva),
        (filas) => veredictoDeGemela(nueva, filas),
      );
      if (destino.kind === 'merged') {
        return await this.yaEstaba(
          userId,
          destino.id,
          dto,
          false,
          true,
          interpretado.clasificacion,
        );
      }
      return creadaAVista(await this.transactions.obtener(userId, destino.id), interpretado);
    } catch (error) {
      /*
        Dos capturas con el mismo `external_ref` a la vez —dos reintentos que
        se cruzan— pasan las dos la comprobación de arriba y llegan las dos a
        insertar. La segunda choca con el índice único: es la idempotencia
        haciendo su trabajo en la base, y se contesta igual que si hubiera
        estado desde el principio.
      */
      if (!(error instanceof DuplicateError)) throw error;
      const existente = await this.ledger.findIdByExternalRef(userId, dto.external_ref);
      // Parity with the former findFirstOrThrow: a vanished row is a 404.
      if (existente === null) throw new NotFoundError('El recurso no existe.');
      return this.yaEstaba(userId, existente, dto, true, false, interpretado.clasificacion);
    }
  }

  // ── Plomería ───────────────────────────────────────────────────────────────

  private async leer(
    userId: bigint,
    dto: InterpretBodyDto,
    elegida: ClasificacionInterpretada | null = null,
  ): Promise<Interpretado> {
    const monto = dto.monto?.replace(',', '.');
    if (!dto.texto?.trim() && !dto.comercio?.trim()) {
      /*
        Un gasto anotado a mano en el teléfono —concepto y monto, nada más— no
        tiene nada que interpretar: no hay texto del que sacar un comercio ni
        una fecha, y la clasificación ya está decidida. Se arma el resultado
        directo sin pasar por `interpretar()`, que seguiría buscando en vacío.
        Sin monto o sin elección, sí falta algo que leer.
      */
      if (elegida && monto !== undefined) {
        return {
          monto,
          fecha: dto.fecha ?? null,
          comercio: null,
          descripcion: null,
          clasificacion: elegida,
          porRevisar: elegida.certeza !== 'alta',
        };
      }
      throw new ValidationError('Hace falta un texto o, al menos, el comercio.', {
        code: 'interpretation_needs_text',
      });
    }

    const [arbol, historial] = await Promise.all([
      this.arbolDe(userId),
      // El historial se consulta con lo más parecido a una descripción: el
      // comercio si viene; si no, el texto. Un SMS entero trae mucho ruido de
      // banco y el historial lo nota en la confianza, que es lo correcto.
      this.categorization.sugerirPara(userId, dto.comercio?.trim() || dto.texto?.trim() || ''),
    ]);

    const leido = interpretar(
      {
        texto: dto.texto,
        comercio: dto.comercio,
        monto,
        fecha: dto.fecha,
        nombreDeArchivo: dto.nombre_de_archivo,
        periodo: dto.periodo,
      },
      {
        arbol,
        historial: historial
          ? { categoryId: String(historial.categoryId), confidence: historial.confidence }
          : null,
        hoy: hoyEnBogota(),
      },
    );
    if (!elegida) return leido;

    // Lo que el motor entendió del texto —monto, fecha, comercio— se queda;
    // lo que propuso como clasificación, no: la persona ya lo decidió. Y lo
    // que marca para revisar es solo la elección a medias (una categoría sin
    // concepto), no la duda del motor, que aquí no cuenta.
    return { ...leido, clasificacion: elegida, porRevisar: elegida.certeza !== 'alta' };
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
  private async clasificacionElegida(
    userId: bigint,
    id: bigint,
  ): Promise<ClasificacionInterpretada> {
    const fila = await this.categories.findChosen(userId, id);
    // La misma respuesta para «no existe» y «no es tuya»: decir cuál de las
    // dos es revelaría ids ajenos.
    if (!fila)
      throw new ValidationError('La categoría indicada no existe o no es tuya.', {
        code: 'category_not_owned',
      });
    if (fila.isArchived)
      throw new ValidationError('Ese concepto está archivado.', { code: 'concept_archived' });
    if (!fila.parent)
      throw new ValidationError('Un centro de costos no clasifica nada: elige un concepto.', {
        code: 'cost_center_cannot_classify',
      });

    const esConcepto = fila.parent.parentId !== null;
    return {
      certeza: esConcepto ? 'alta' : 'media',
      fuente: null,
      conceptoId: esConcepto ? fila.id.toString() : null,
      categoriaId: esConcepto ? fila.parent.id.toString() : fila.id.toString(),
      nombre: fila.name,
      candidatos: [],
      motivo: 'Lo eligió la persona.',
    };
  }

  /**
   * El árbol de la persona, con ids como cadenas, sin lo archivado.
   *
   * Archivado quiere decir «esto ya no vuelve»: proponerlo sería clasificar
   * un gasto de hoy en el gimnasio que se dio de baja.
   */
  private async arbolDe(userId: bigint): Promise<SearchableNode[]> {
    const filas = await this.categories.findSearchable(userId);
    const aNodo = (f: {
      id: bigint;
      name: string;
      keywords: string[];
      children: unknown[];
    }): SearchableNode => ({
      id: f.id.toString(),
      name: f.name,
      keywords: f.keywords,
      children: (f.children as (typeof f)[]).map(aNodo),
    });
    return anidar(filas).map(aNodo);
  }

  private async yaEstaba(
    userId: bigint,
    id: bigint,
    dto: CaptureBodyDto,
    repetido: boolean,
    fusionado: boolean,
    clasificacion?: ClasificacionInterpretada,
  ): Promise<Capture> {
    const transaction = await this.transactions.obtener(userId, id);
    const vista: ClasificacionInterpretada = clasificacion ??
      // De una repetida no se vuelve a interpretar: lo que importa es lo que
      // quedó guardado, que es lo que se le dice.
      {
        certeza: transaction.categoryId === null ? 'ninguna' : 'alta',
        fuente: null,
        conceptoId: transaction.categoryId === null ? null : transaction.categoryId.toString(),
        categoriaId: null,
        nombre: null,
        candidatos: [],
        motivo: `Ya estaba registrado con la referencia ${dto.external_ref}.`,
      };
    return {
      transaction,
      classification: classificationOf(vista),
      summary: fusionado
        ? `Era el mismo pago: ${resumenDe(transaction.amount, vista).replace(/^Registrado: /, '')}`
        : resumenDe(transaction.amount, vista),
      isDuplicate: repetido,
      isMerged: fusionado,
    };
  }
}

/** Lo que `TransactionsService` pide para crear, sin importar su DTO (los módulos hablan por servicios). */
type NuevoMovimiento = Parameters<TransactionsService['crear']>[1];

/** Lo que se escribe de una captura, como lo pide `TransactionsService`. */
function altaDe(
  dto: CaptureBodyDto,
  nueva: CapturaNueva,
  interpretado: Interpretado,
): NuevoMovimiento {
  return {
    date: nueva.date,
    amount: nueva.amount,
    type: 'expense',
    category_id: idParaGuardar(interpretado.clasificacion),
    description: interpretado.descripcion ?? undefined,
    merchant: interpretado.comercio ?? undefined,
    notes: notasDe(dto.nota, interpretado.monto),
    external_ref: dto.external_ref,
    source: dto.source,
    raw_text: dto.texto ?? null,
    captured_at: nueva.capturedAt.toISOString(),
    por_revisar: interpretado.porRevisar,
  };
}

function creadaAVista(creada: Transaction, interpretado: Interpretado): Capture {
  return {
    transaction: creada,
    classification: classificationOf(interpretado.clasificacion),
    summary: resumenDe(interpretado.monto, interpretado.clasificacion),
    isDuplicate: false,
    isMerged: false,
  };
}
