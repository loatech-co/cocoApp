import { Injectable, UnprocessableEntityException } from '@nestjs/common';
import { Prisma, type TransactionSource } from '@prisma/client';
import type { NodoBuscable } from '@coco/lectura';

import { toMoney } from '../../common/money/money';
import { PrismaService } from '../../prisma/prisma.service';
import { anidar } from '../categories/categories.tree';
import { CategorizationService } from '../categorization/categorization.module';
import { TransactionsService, type TransactionView } from '../transactions/transactions.service';
import {
  ORIGENES_QUE_SE_DUPLICAN,
  VENTANA_PARCIAL_MS,
  decidirDuplicado,
  enriquecer,
  type CapturaConocida,
} from './duplicados';
import { interpretar, resumenDe, type ClasificacionInterpretada, type Interpretado } from './interpretar';
import type { CaptureBodyDto, InterpretBodyDto } from './interpretacion.dto';

/** La clasificación propuesta, con los ids como los entiende el resto de la API. */
export interface ClasificacionView {
  certeza: ClasificacionInterpretada['certeza'];
  fuente: ClasificacionInterpretada['fuente'];
  concepto_id: bigint | null;
  categoria_id: bigint | null;
  nombre: string | null;
  candidatos: { id: bigint; nombre: string; ruta: string }[];
  motivo: string;
}

export interface InterpretacionView {
  amount: string | null;
  date: string | null;
  merchant: string | null;
  description: string | null;
  clasificacion: ClasificacionView;
  por_revisar: boolean;
}

export interface CapturaView {
  transaction: TransactionView;
  clasificacion: ClasificacionView;
  resumen: string;
  repetido: boolean;
  fusionado: boolean;
}

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
    private readonly prisma: PrismaService,
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
    const repetida = await this.prisma.transaction.findFirst({
      where: { userId, externalRef: dto.external_ref },
      select: { id: true },
    });
    if (repetida) return this.yaEstaba(userId, repetida.id, dto, true, false);

    const interpretado = await this.leer(userId, dto);
    const capturadaEn = dto.captured_at ? new Date(dto.captured_at) : new Date();

    // Sin fecha legible, la del momento de la captura: un gasto necesita un
    // día, y el de la captura es la mejor aproximación. Queda marcado.
    const fecha = interpretado.fecha ?? capturadaEn.toISOString().slice(0, 10);
    // Sin monto, cero y marcado: Wallet a veces agota su espera y manda la
    // transacción sin valor. Perderla sería peor que registrarla en cero para
    // que alguien le ponga la cifra.
    const monto = interpretado.monto ?? '0';
    let porRevisar = interpretado.porRevisar;

    /*
      ── La otra cara del mismo pago ─────────────────────────────────────────
      Solo desde Wallet o SMS. Se traen las candidatas de la base —misma
      persona, mismo monto, otro origen, cerca en fecha y en tiempo— y decide
      la función pura. Exacto: se enriquece la que había y se devuelve. Parcial:
      se crea, pero marcada.
    */
    if (ORIGENES_QUE_SE_DUPLICAN.has(dto.source)) {
      const candidatas = await this.candidatasADuplicado(userId, dto.source, monto, fecha, capturadaEn);
      const veredicto = decidirDuplicado(
        {
          source: dto.source,
          date: fecha,
          amount: monto,
          capturedAt: capturadaEn,
          rawText: dto.texto ?? null,
          merchant: interpretado.comercio,
          description: interpretado.descripcion,
        },
        candidatas,
      );

      if (veredicto.tipo === 'exacto') {
        const cambios = enriquecer(veredicto.con, {
          source: dto.source,
          date: fecha,
          amount: monto,
          capturedAt: capturadaEn,
          rawText: dto.texto ?? null,
          merchant: interpretado.comercio,
          description: interpretado.descripcion,
        });
        if (Object.keys(cambios).length > 0) {
          await this.prisma.transaction.update({ where: { id: veredicto.con.id }, data: cambios });
        }
        return this.yaEstaba(userId, veredicto.con.id, dto, false, true, interpretado.clasificacion);
      }
      if (veredicto.tipo === 'parcial') porRevisar = true;
    }

    try {
      const creada = await this.transactions.crear(userId, {
        date: fecha,
        amount: monto,
        type: 'expense',
        category_id: idParaGuardar(interpretado.clasificacion),
        description: interpretado.descripcion ?? undefined,
        merchant: interpretado.comercio ?? undefined,
        notes: interpretado.monto === null ? 'Capturado sin valor: hay que ponerlo.' : undefined,
        external_ref: dto.external_ref,
        source: dto.source,
        raw_text: dto.texto ?? null,
        captured_at: capturadaEn.toISOString(),
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
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const existente = await this.prisma.transaction.findFirstOrThrow({
          where: { userId, externalRef: dto.external_ref },
          select: { id: true },
        });
        return this.yaEstaba(userId, existente.id, dto, true, false, interpretado.clasificacion);
      }
      throw error;
    }
  }

  // ── Plomería ───────────────────────────────────────────────────────────────

  private async leer(userId: bigint, dto: InterpretBodyDto): Promise<Interpretado> {
    if (!dto.texto?.trim() && !dto.comercio?.trim()) {
      throw new UnprocessableEntityException('Hace falta un texto o, al menos, el comercio.');
    }

    const [arbol, historial] = await Promise.all([
      this.arbolDe(userId),
      // El historial se consulta con lo más parecido a una descripción: el
      // comercio si viene; si no, el texto. Un SMS entero trae mucho ruido de
      // banco y el historial lo nota en la confianza, que es lo correcto.
      this.categorization.sugerirPara(userId, dto.comercio?.trim() || dto.texto?.trim() || ''),
    ]);

    return interpretar(
      {
        texto: dto.texto,
        comercio: dto.comercio,
        monto: dto.monto?.replace(',', '.'),
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
  }

  /**
   * El árbol de la persona, con ids como cadenas, sin lo archivado.
   *
   * Archivado quiere decir «esto ya no vuelve»: proponerlo sería clasificar
   * un gasto de hoy en el gimnasio que se dio de baja.
   */
  private async arbolDe(userId: bigint): Promise<NodoBuscable[]> {
    const filas = await this.prisma.category.findMany({
      where: { userId, isArchived: false },
      select: { id: true, parentId: true, name: true, palabrasClave: true },
      orderBy: { sortOrder: 'asc' },
    });
    const aNodo = (f: { id: bigint; name: string; palabrasClave: string[]; children: unknown[] }): NodoBuscable => ({
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
    const filas = await this.prisma.transaction.findMany({
      where: {
        userId,
        amount: toMoney(monto),
        source: { not: source },
        date: { gte: desde, lte: hasta },
        OR: [
          { capturedAt: { gte: new Date(capturadaEn.getTime() - VENTANA_PARCIAL_MS), lte: new Date(capturadaEn.getTime() + VENTANA_PARCIAL_MS) } },
          { capturedAt: null, createdAt: { gte: new Date(capturadaEn.getTime() - VENTANA_PARCIAL_MS), lte: new Date(capturadaEn.getTime() + VENTANA_PARCIAL_MS) } },
        ],
      },
      select: { id: true, source: true, date: true, amount: true, capturedAt: true, createdAt: true, rawText: true, merchant: true, description: true },
      take: 20,
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
    const vista: ClasificacionInterpretada =
      clasificacion ??
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

function idParaGuardar(c: ClasificacionInterpretada): number | undefined {
  // Alta: el concepto. Media: la categoría, si la hay —queda marcado para
  // revisar, pero ya está en el sitio correcto a medias—. Ninguna: nada.
  const id = c.certeza === 'alta' ? (c.conceptoId ?? c.categoriaId) : c.certeza === 'media' ? c.categoriaId : null;
  return id === null ? undefined : Number(id);
}

function clasificacionAVista(c: ClasificacionInterpretada): ClasificacionView {
  return {
    certeza: c.certeza,
    fuente: c.fuente,
    concepto_id: c.conceptoId === null ? null : BigInt(c.conceptoId),
    categoria_id: c.categoriaId === null ? null : BigInt(c.categoriaId),
    nombre: c.nombre,
    candidatos: c.candidatos.map((k) => ({ id: BigInt(k.id), nombre: k.nombre, ruta: k.ruta })),
    motivo: c.motivo,
  };
}

function aVista(i: Interpretado): InterpretacionView {
  return {
    amount: i.monto,
    date: i.fecha,
    merchant: i.comercio,
    description: i.descripcion,
    clasificacion: clasificacionAVista(i.clasificacion),
    por_revisar: i.porRevisar,
  };
}

function hoyEnBogota(): string {
  return new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString().slice(0, 10);
}
