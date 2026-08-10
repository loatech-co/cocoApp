import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import type { ImportBatch, ImportRow, ImportRowStatus, Prisma } from '@prisma/client';

import { serializar, toMoney } from '../../common/money/money';
import { PrismaService } from '../../prisma/prisma.service';
import { CategorizationService } from '../categorization/categorization.module';
import { sugerirCategoria } from '../categorization/categorization';
import type { CreateImportDto, UpdateImportRowDto } from './dto/import.dto';
import { aFechaISO, calcularHuella } from './fingerprint';

export interface ImportRowView {
  id: bigint;
  position: number;
  date: string;
  amount: string;
  type: ImportRow['type'];
  description: string | null;
  status: ImportRowStatus;
  category_id: bigint | null;
  confidence: number | null;
  /** Si se sospecha repetición, el movimiento al que se parece. */
  duplicate_of_id: bigint | null;
}

export interface ImportBatchView {
  id: bigint;
  uuid: string;
  account_id: bigint | null;
  source: ImportBatch['source'];
  status: ImportBatch['status'];
  label: string | null;
  ocr_provider: string | null;
  committed_at: Date | null;
  created_at: Date;
  /** Cuántas filas hay de cada estado. Es el resumen de la pantalla de revisión. */
  counts: Record<ImportRowStatus, number>;
  rows?: ImportRowView[];
}

@Injectable()
export class ImportsService {
  private readonly logger = new Logger(ImportsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly categorization: CategorizationService,
  ) {}

  // ── Creación ───────────────────────────────────────────────────────────────

  /**
   * Crea un lote en borrador a partir de las filas que el cliente parseó.
   *
   * Aquí llegan filas, NUNCA el documento: ni la imagen, ni el PDF, ni el texto
   * crudo del OCR. Todo el beneficio de leer en el navegador es que el extracto
   * —con su número de cuenta, sus saldos y el nombre del titular— no sale del
   * equipo. Subirlo destruiría exactamente eso.
   *
   * Dos cosas se calculan en el servidor, no en el cliente:
   *   · La huella y la sospecha de repetición, porque exigen ver TODO el
   *     historial, que el cliente no tiene.
   *   · La sugerencia de categoría, por lo mismo.
   */
  async crear(userId: bigint, dto: CreateImportDto): Promise<ImportBatchView> {
    const accountId = dto.account_id !== undefined ? BigInt(dto.account_id) : null;
    if (accountId !== null) await this.exigirCuentaPropia(userId, accountId);

    const huellas = dto.rows.map((fila) =>
      calcularHuella({
        accountId,
        date: aFechaUTC(fila.date),
        amount: toMoney(fila.amount),
        description: fila.description,
      }),
    );

    const [yaExistentes, contexto] = await Promise.all([
      this.buscarPosiblesRepetidos(userId, huellas),
      this.categorization.prepararContexto(userId),
    ]);

    const lote = await this.prisma.importBatch.create({
      data: {
        userId,
        accountId,
        source: dto.source,
        label: dto.label ?? null,
        ocrProvider: dto.ocr_provider ?? null,
        rows: {
          create: dto.rows.map((fila, indice) => {
            const huella = huellas[indice];
            const repetido = yaExistentes.get(huella) ?? null;
            const sugerencia = sugerirCategoria(fila.description, contexto);

            return {
              position: indice,
              date: aFechaUTC(fila.date),
              amount: toMoney(fila.amount),
              type: fila.type,
              description: fila.description ?? null,
              fingerprint: huella,
              // La sospecha se marca; NO se descarta. Dos cafés de $5.000 el
              // mismo día en el mismo sitio son dos movimientos reales.
              status: repetido ? ('duplicate' as const) : ('accepted' as const),
              duplicateOfId: repetido,
              categoryId: sugerencia?.categoryId ?? null,
              confidence: sugerencia?.confidence ?? null,
            };
          }),
        },
      },
      include: { rows: { orderBy: { position: 'asc' } } },
    });

    return aVistaDeLote(lote, lote.rows);
  }

  /**
   * Movimientos ya existentes cuya huella coincide con alguna de las nuevas.
   *
   * Una sola consulta con `IN`, no una por fila: un extracto de doscientos
   * movimientos costaría doscientas consultas.
   */
  private async buscarPosiblesRepetidos(
    userId: bigint,
    huellas: string[],
  ): Promise<Map<string, bigint>> {
    if (huellas.length === 0) return new Map();

    const existentes = await this.prisma.transaction.findMany({
      where: { userId, externalRef: { in: [...new Set(huellas)] } },
      select: { id: true, externalRef: true },
    });

    const mapa = new Map<string, bigint>();
    for (const movimiento of existentes) {
      // Si hay varios con la misma huella, el primero basta: solo se usa para
      // decir "se parece a este".
      if (movimiento.externalRef && !mapa.has(movimiento.externalRef)) {
        mapa.set(movimiento.externalRef, movimiento.id);
      }
    }
    return mapa;
  }

  // ── Lectura ────────────────────────────────────────────────────────────────

  async listar(userId: bigint): Promise<ImportBatchView[]> {
    const lotes = await this.prisma.importBatch.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: { rows: { select: { status: true } } },
    });

    return lotes.map((lote) => aVistaDeLote(lote, lote.rows));
  }

  async obtener(userId: bigint, id: bigint): Promise<ImportBatchView> {
    const lote = await this.exigirLote(userId, id, true);
    return aVistaDeLote(lote, lote.rows);
  }

  // ── Revisión ───────────────────────────────────────────────────────────────

  /** Corrige una fila. Solo mientras el lote sigue en borrador. */
  async editarFila(
    userId: bigint,
    loteId: bigint,
    filaId: bigint,
    dto: UpdateImportRowDto,
  ): Promise<ImportRowView> {
    const lote = await this.exigirLote(userId, loteId, false);
    this.exigirBorrador(lote);

    const fila = await this.prisma.importRow.findFirst({
      where: { id: filaId, batchId: loteId },
    });
    if (!fila) throw new NotFoundException('Esa fila no existe en este lote.');

    if (dto.category_id !== undefined && dto.category_id !== null) {
      await this.exigirCategoriaPropia(userId, BigInt(dto.category_id));
    }

    const datos: Prisma.ImportRowUpdateInput = {};
    if (dto.date !== undefined) datos.date = aFechaUTC(dto.date);
    if (dto.amount !== undefined) datos.amount = toMoney(dto.amount);
    if (dto.type !== undefined) datos.type = dto.type;
    if (dto.description !== undefined) datos.description = dto.description;
    if (dto.status !== undefined) datos.status = dto.status;
    if (dto.category_id !== undefined) {
      datos.category =
        dto.category_id === null
          ? { disconnect: true }
          : { connect: { id: BigInt(dto.category_id) } };
      // La confianza dejó de tener sentido: la eligió una persona, no el sistema.
      datos.confidence = null;
    }

    // Si cambió algo que entra en la huella, hay que recalcularla: si no, el
    // dedupe de la PRÓXIMA importación compararía contra un dato ya corregido.
    if (dto.date !== undefined || dto.amount !== undefined || dto.description !== undefined) {
      datos.fingerprint = calcularHuella({
        accountId: lote.accountId,
        date: dto.date !== undefined ? aFechaUTC(dto.date) : fila.date,
        amount: dto.amount !== undefined ? toMoney(dto.amount) : fila.amount,
        description: dto.description !== undefined ? dto.description : fila.description,
      });
    }

    return aVistaDeFila(await this.prisma.importRow.update({ where: { id: filaId }, data: datos }));
  }

  // ── Confirmación ───────────────────────────────────────────────────────────

  /**
   * Convierte en movimientos reales las filas aceptadas.
   *
   * IDEMPOTENTE POR EL RECURSO: si el lote ya está `committed`, se devuelve el
   * mismo resultado sin crear nada. No hace falta una tabla de claves de
   * idempotencia — el propio estado del lote es la garantía, y un reintento
   * por red intermitente no puede duplicar cuarenta movimientos.
   *
   * Todo ocurre dentro de una transacción: o entran todos los movimientos y el
   * lote queda confirmado, o no entra ninguno.
   */
  async confirmar(userId: bigint, id: bigint): Promise<{ creados: number; lote: ImportBatchView }> {
    const lote = await this.exigirLote(userId, id, true);

    if (lote.status === 'committed') {
      const yaCreados = await this.prisma.transaction.count({ where: { importBatchId: id } });
      return { creados: yaCreados, lote: aVistaDeLote(lote, lote.rows) };
    }
    if (lote.status === 'discarded') {
      throw new ConflictException('Este lote fue descartado y ya no se puede confirmar.');
    }

    const aceptadas = lote.rows.filter((fila) => fila.status === 'accepted');
    if (aceptadas.length === 0) {
      throw new BadRequestException('No hay ninguna fila aceptada que importar.');
    }

    const actualizado = await this.prisma.$transaction(async (tx) => {
      await tx.transaction.createMany({
        data: aceptadas.map((fila) => ({
          userId,
          accountId: lote.accountId,
          date: fila.date,
          amount: fila.amount,
          type: fila.type,
          categoryId: fila.categoryId,
          description: fila.description,
          // La huella se guarda en el movimiento: es lo que permite que la
          // PRÓXIMA importación detecte que esto ya está.
          externalRef: fila.fingerprint,
          importBatchId: lote.id,
        })),
      });

      return tx.importBatch.update({
        where: { id },
        data: { status: 'committed', committedAt: new Date() },
        include: { rows: { orderBy: { position: 'asc' } } },
      });
    });

    // El aprendizaje va FUERA de la transacción: mejorar las sugerencias
    // futuras no puede tumbar una importación que ya cuadró.
    await this.aprenderDeLasCategorias(userId, aceptadas);

    return { creados: aceptadas.length, lote: aVistaDeLote(actualizado, actualizado.rows) };
  }

  private async aprenderDeLasCategorias(userId: bigint, filas: ImportRow[]): Promise<void> {
    for (const fila of filas) {
      if (!fila.categoryId || !fila.description) continue;
      try {
        await this.categorization.aprenderDe(userId, fila.description, fila.categoryId);
      } catch (error) {
        this.logger.warn(
          `No se pudo aprender de la fila ${fila.id}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
  }

  // ── Deshacer y descartar ───────────────────────────────────────────────────

  /**
   * Deshace un lote confirmado: borra los movimientos que creó.
   *
   * Es la razón por la que `transactions.import_batch_id` existe. Sin él, una
   * importación mal parseada solo se arregla borrando cuarenta movimientos a
   * mano, y a esas alturas ya nadie recuerda cuáles eran.
   */
  async deshacer(userId: bigint, id: bigint): Promise<{ borrados: number }> {
    const lote = await this.exigirLote(userId, id, false);

    if (lote.status !== 'committed') {
      throw new ConflictException('Este lote no está confirmado, así que no hay nada que deshacer.');
    }

    const { count } = await this.prisma.$transaction(async (tx) => {
      const borrados = await tx.transaction.deleteMany({
        where: { userId, importBatchId: id },
      });
      await tx.importBatch.update({
        where: { id },
        data: { status: 'discarded', committedAt: null },
      });
      return borrados;
    });

    return { borrados: count };
  }

  /** Descarta un borrador sin confirmar. Las filas caen por CASCADE. */
  async descartar(userId: bigint, id: bigint): Promise<void> {
    const lote = await this.exigirLote(userId, id, false);

    if (lote.status === 'committed') {
      throw new ConflictException('Este lote ya está confirmado. Usa "deshacer" en su lugar.');
    }

    await this.prisma.importBatch.delete({ where: { id } });
  }

  // ── Guardas ────────────────────────────────────────────────────────────────

  private async exigirLote<T extends boolean>(
    userId: bigint,
    id: bigint,
    conFilas: T,
  ): Promise<ImportBatch & { rows: ImportRow[] }> {
    const lote = await this.prisma.importBatch.findFirst({
      // El filtro por userId es el scoping: un lote ajeno responde 404, nunca
      // 403, para no confirmar que existe.
      where: { id, userId },
      include: { rows: conFilas ? { orderBy: { position: 'asc' } } : true },
    });

    if (!lote) throw new NotFoundException('El lote de importación no existe.');
    return lote;
  }

  private exigirBorrador(lote: ImportBatch): void {
    if (lote.status !== 'draft') {
      throw new ConflictException('El lote ya no está en revisión.');
    }
  }

  /**
   * 422 y no 404, igual que en el módulo de movimientos.
   *
   * La distinción es la del propio HTTP: 404 es "el recurso de esta URL no
   * existe" —y por eso `GET /imports/999` sí devuelve 404—; 422 es "el cuerpo
   * está bien formado pero referencia algo que no sirve", que es exactamente
   * el caso de un `account_id` inválido dentro del cuerpo.
   *
   * El mensaje sigue sin confirmar si la cuenta existe o solo es de otro: eso
   * es lo que evita que este endpoint sirva para enumerar cuentas ajenas.
   */
  private async exigirCuentaPropia(userId: bigint, accountId: bigint): Promise<void> {
    const existe = await this.prisma.account.count({ where: { id: accountId, userId } });
    if (existe === 0) {
      throw new UnprocessableEntityException('La cuenta indicada no existe o no es tuya.');
    }
  }

  private async exigirCategoriaPropia(userId: bigint, categoryId: bigint): Promise<void> {
    const existe = await this.prisma.category.count({ where: { id: categoryId, userId } });
    if (existe === 0) {
      throw new UnprocessableEntityException('La categoría indicada no existe o no es tuya.');
    }
  }
}

// ── Vistas ───────────────────────────────────────────────────────────────────

function aVistaDeFila(fila: ImportRow): ImportRowView {
  return {
    id: fila.id,
    position: fila.position,
    date: aFechaISO(fila.date),
    amount: serializar(fila.amount),
    type: fila.type,
    description: fila.description,
    status: fila.status,
    category_id: fila.categoryId,
    confidence: fila.confidence,
    duplicate_of_id: fila.duplicateOfId,
  };
}

function aVistaDeLote(
  lote: ImportBatch,
  filas: (ImportRow | { status: ImportRowStatus })[],
): ImportBatchView {
  const counts: Record<ImportRowStatus, number> = {
    pending: 0,
    accepted: 0,
    duplicate: 0,
    skipped: 0,
  };
  for (const fila of filas) counts[fila.status] += 1;

  // Solo se devuelven las filas completas si vinieron completas: el listado de
  // lotes no necesita arrastrar doscientas filas por lote.
  const completas = filas.every((fila) => 'id' in fila)
    ? (filas).map(aVistaDeFila)
    : undefined;

  return {
    id: lote.id,
    uuid: lote.uuid,
    account_id: lote.accountId,
    source: lote.source,
    status: lote.status,
    label: lote.label,
    ocr_provider: lote.ocrProvider,
    committed_at: lote.committedAt,
    created_at: lote.createdAt,
    counts,
    rows: completas,
  };
}

/**
 * `YYYY-MM-DD` → medianoche UTC.
 *
 * `new Date('2026-08-01')` ya lo hace, pero se deja explícito porque el matiz
 * importa: si se construyera en hora local, en Bogotá (UTC-5) la fecha se
 * guardaría como el día anterior y la huella dejaría de coincidir.
 */
function aFechaUTC(iso: string): Date {
  return new Date(`${iso.slice(0, 10)}T00:00:00.000Z`);
}
