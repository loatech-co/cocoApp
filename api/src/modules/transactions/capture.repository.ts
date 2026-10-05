import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import type {
  CaptureOutcome,
  DuplicateCandidateRow,
  DuplicateCriteria,
  NewTransaction,
  TwinVerdict,
} from './ledger.types';
import { writeDetails } from './transactions.repository';
import { DuplicateError } from '../../common/errors/domain-error';
import { Database } from '../../prisma/database';

/**
 * The write of a Wallet or SMS capture: look for the other side of the same
 * payment and, in the SAME database transaction, merge into it or insert.
 */
@Injectable()
export class CaptureRepository {
  constructor(private readonly db: Database) {}

  /**
   * ── Por qué el candado ────────────────────────────────────────────────────
   * Wallet y el SMS del mismo pago llegan casi a la vez. Sin candado, las dos
   * capturas buscan la gemela, ninguna ve a la otra —todavía no se ha
   * escrito— y las dos insertan: el gasto queda duplicado.
   *
   * `pg_advisory_xact_lock` pone en fila a las capturas de la misma persona y
   * el mismo monto, y se suelta solo al terminar la transacción. La segunda
   * espera, y cuando entra ya ve la fila de la primera (READ COMMITTED lee lo
   * confirmado en cada sentencia). La clave lleva persona y monto, no la
   * fecha: la ventana de duplicados cruza días (`days` es ±1), y una clave con
   * la fecha dejaría pasar dos capturas de días vecinos a la vez. Lo que
   * comparten todas las candidatas es el monto, y eso basta para cubrirla.
   *
   * Todo va por `tx`: una lectura por otra conexión, con el candado tomado,
   * puede quedarse sin conexión libre en el pool y no volver nunca. Y `tx` es
   * la unidad de `forUser` (ADR 0019): el candado es su primera sentencia
   * tras fijar el usuario, así que cubre la búsqueda y la escritura con la
   * seguridad por filas activa. Otra transacción aparte lo dejaría fuera.
   *
   * A clash on the unique `external_ref` becomes a DuplicateError, as in
   * `createWithDetails`.
   */
  async createUnlessTwin(
    movement: NewTransaction,
    criteria: DuplicateCriteria,
    decide: (candidates: DuplicateCandidateRow[]) => TwinVerdict,
  ): Promise<CaptureOutcome> {
    try {
      return await this.db.forUser(criteria.userId, async (tx) => {
        await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtextextended(${captureLockKey(criteria)}::text, 0))`;

        const verdict = decide(await tx.transaction.findMany(duplicateCandidatesQuery(criteria)));
        if (verdict.kind === 'merge') {
          if (Object.keys(verdict.changes).length > 0) {
            await tx.transaction.update({ where: { id: verdict.id }, data: verdict.changes });
          }
          return { kind: 'merged', id: verdict.id };
        }

        const porRevisar = movement.data.porRevisar === true || verdict.flag;
        const created = await tx.transaction.create({
          data: { ...movement.data, porRevisar },
          select: { id: true },
        });
        await writeDetails(tx, created.id, movement.splits, movement.tagIds);
        return { kind: 'created', id: created.id };
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new DuplicateError();
      }
      throw error;
    }
  }
}

/** One lock per person and amount: every candidate of a capture shares both. */
function captureLockKey(criteria: DuplicateCriteria): string {
  return `capture:${criteria.userId.toString()}:${criteria.amount.toFixed(2)}`;
}

/**
 * Misma persona, mismo monto, otro origen, cerca en fecha y en tiempo. Sin
 * hora de captura, por la de creación. A lo sumo veinte.
 */
function duplicateCandidatesQuery(criteria: DuplicateCriteria) {
  const { userId, source, amount, days, window } = criteria;
  return {
    where: {
      userId,
      amount,
      source: { not: source },
      date: { gte: days.from, lte: days.to },
      OR: [
        { capturedAt: { gte: window.from, lte: window.to } },
        { capturedAt: null, createdAt: { gte: window.from, lte: window.to } },
      ],
    },
    select: {
      id: true,
      source: true,
      date: true,
      amount: true,
      capturedAt: true,
      createdAt: true,
      rawText: true,
      merchant: true,
      description: true,
    },
    take: 20,
  } satisfies Prisma.TransactionFindManyArgs;
}
