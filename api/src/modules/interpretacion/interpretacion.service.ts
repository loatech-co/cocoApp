import { Injectable } from '@nestjs/common';
import type { TransactionSource } from '@prisma/client';

import type { NodoBuscable } from '@coco/lectura';

import {
  ORIGENES_QUE_SE_DUPLICAN,
  VENTANA_PARCIAL_MS,
  decidirDuplicado,
  enriquecer,
  type CapturaConocida,
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
  aVista,
  clasificacionAVista,
  hoyEnBogota,
  idParaGuardar,
  notasDe,
  type CapturaView,
  type InterpretacionView,
} from './interpretation.view';
import { anidar } from '../../common/categories/categories.tree';
import { DuplicateError, NotFoundError, ValidationError } from '../../common/errors/domain-error';
import { toMoney } from '../../common/money/money';
import { CategoryLookupService } from '../categories/category-lookup.service';
import { CategorizationService } from '../categorization/categorization.service';
import { LedgerService } from '../transactions/ledger.service';
import { TransactionsService } from '../transactions/transactions.service';

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

  async interpretar(userId: bigint, dto: InterpretBodyDto): Promise<InterpretacionView> {
    const interpretado = await this.leer(userId, dto);
    return aVista(interpretado);
  }

  async capturar(userId: bigint, dto: CaptureBodyDto): Promise<CapturaView> {
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

    const gemela = await this.otraCaraDelMismoPago(userId, dto, nueva, interpretado);
    if (gemela.fusionada) return gemela.fusionada;

    return this.registrar(
      userId,
      dto,
      nueva,
      interpretado,
      interpretado.porRevisar || gemela.parcial,
    );
  }

  /*
    ── La otra cara del mismo pago ─────────────────────────────────────────
    Solo desde Wallet o SMS. Se traen las candidatas de la base —misma
    persona, mismo monto, otro origen, cerca en fecha y en tiempo— y decide
    la función pura. Exacto: se enriquece la que había y se devuelve. Parcial:
    se crea, pero marcada.
  */
  private async otraCaraDelMismoPago(
    userId: bigint,
    dto: CaptureBodyDto,
    nueva: CapturaNueva,
    interpretado: Interpretado,
  ): Promise<{ fusionada: CapturaView | null; parcial: boolean }> {
    if (!ORIGENES_QUE_SE_DUPLICAN.has(dto.source)) return { fusionada: null, parcial: false };

    const candidatas = await this.candidatasADuplicado(
      userId,
      dto.source,
      nueva.amount,
      nueva.date,
      nueva.capturedAt,
    );
    const veredicto = decidirDuplicado(nueva, candidatas);

    if (veredicto.tipo === 'exacto') {
      const cambios = enriquecer(veredicto.con, nueva);
      if (Object.keys(cambios).length > 0) {
        await this.ledger.enrich(userId, veredicto.con.id, cambios);
      }
      const fusionada = await this.yaEstaba(
        userId,
        veredicto.con.id,
        dto,
        false,
        true,
        interpretado.clasificacion,
      );
      return { fusionada, parcial: false };
    }
    return { fusionada: null, parcial: veredicto.tipo === 'parcial' };
  }

  private async registrar(
    userId: bigint,
    dto: CaptureBodyDto,
    nueva: CapturaNueva,
    interpretado: Interpretado,
    porRevisar: boolean,
  ): Promise<CapturaView> {
    try {
      const creada = await this.transactions.crear(userId, {
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
        por_revisar: porRevisar,
      });
      return {
        transaction: creada,
        clasificacion: clasificacionAVista(interpretado.clasificacion),
        resumen: resumenDe(interpretado.monto, interpretado.clasificacion),
        repetido: false,
        fusionado: false,
      };
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
      throw new ValidationError('Hace falta un texto o, al menos, el comercio.');
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
          ? { categoryId: String(historial.category_id), confidence: historial.confidence }
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
    if (!fila) throw new ValidationError('La categoría indicada no existe o no es tuya.');
    if (fila.isArchived) throw new ValidationError('Ese concepto está archivado.');
    if (!fila.parent)
      throw new ValidationError('Un centro de costos no clasifica nada: elige un concepto.');

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
  private async arbolDe(userId: bigint): Promise<NodoBuscable[]> {
    const filas = await this.categories.findSearchable(userId);
    const aNodo = (f: {
      id: bigint;
      name: string;
      palabrasClave: string[];
      children: unknown[];
    }): NodoBuscable => ({
      id: f.id.toString(),
      name: f.name,
      palabras_clave: f.palabrasClave,
      children: (f.children as (typeof f)[]).map(aNodo),
    });
    return anidar(filas).map(aNodo);
  }

  private async candidatasADuplicado(
    userId: bigint,
    source: TransactionSource,
    monto: string,
    fecha: string,
    capturadaEn: Date,
  ): Promise<CapturaConocida[]> {
    const dia = new Date(fecha);
    const desde = new Date(dia.getTime() - 24 * 60 * 60_000);
    const hasta = new Date(dia.getTime() + 24 * 60 * 60_000);
    const filas = await this.ledger.findDuplicateCandidates({
      userId,
      source,
      amount: toMoney(monto),
      days: { from: desde, to: hasta },
      window: {
        from: new Date(capturadaEn.getTime() - VENTANA_PARCIAL_MS),
        to: new Date(capturadaEn.getTime() + VENTANA_PARCIAL_MS),
      },
    });
    return filas.map((f) => ({
      id: f.id,
      source: f.source,
      date: f.date.toISOString().slice(0, 10),
      amount: f.amount.toString(),
      capturedAt: f.capturedAt,
      createdAt: f.createdAt,
      rawText: f.rawText,
      merchant: f.merchant,
      description: f.description,
    }));
  }

  private async yaEstaba(
    userId: bigint,
    id: bigint,
    dto: CaptureBodyDto,
    repetido: boolean,
    fusionado: boolean,
    clasificacion?: ClasificacionInterpretada,
  ): Promise<CapturaView> {
    const transaction = await this.transactions.obtener(userId, id);
    const vista: ClasificacionInterpretada = clasificacion ??
      // De una repetida no se vuelve a interpretar: lo que importa es lo que
      // quedó guardado, que es lo que se le dice.
      {
        certeza: transaction.category_id === null ? 'ninguna' : 'alta',
        fuente: null,
        conceptoId: transaction.category_id === null ? null : transaction.category_id.toString(),
        categoriaId: null,
        nombre: null,
        candidatos: [],
        motivo: `Ya estaba registrado con la referencia ${dto.external_ref}.`,
      };
    return {
      transaction,
      clasificacion: clasificacionAVista(vista),
      resumen: fusionado
        ? `Era el mismo pago: ${resumenDe(transaction.amount, vista).replace(/^Registrado: /, '')}`
        : resumenDe(transaction.amount, vista),
      repetido,
      fusionado,
    };
  }
}
