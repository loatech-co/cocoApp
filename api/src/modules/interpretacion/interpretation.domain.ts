/** What the interpretation service hands out (the domain), and the pure helpers that build it. */
import type { ClasificacionInterpretada, Interpretado } from './interpretar';
import { CERTAINTY, CLASSIFICATION_SOURCE, english, type English } from '../../common/vocabulary';
import type { Transaction } from '../transactions/transactions.service';

export type Certainty = English<typeof CERTAINTY>;
export type ClassificationSource = English<typeof CLASSIFICATION_SOURCE>;

interface Candidate {
  id: bigint;
  name: string;
  /** Where it hangs, as the user reads it: `Center › Category › Concept`. */
  path: string;
}

/** The proposed classification, with the ids as the rest of the API knows them. */
export interface Classification {
  certainty: Certainty;
  source: ClassificationSource | null;
  conceptId: bigint | null;
  categoryId: bigint | null;
  name: string | null;
  candidates: Candidate[];
  /** Why, in Spanish: the client shows it as is. */
  reason: string;
}

export interface Interpretation {
  amount: string | null;
  date: string | null;
  merchant: string | null;
  description: string | null;
  classification: Classification;
  needsReview: boolean;
}

export interface Capture {
  transaction: Transaction;
  classification: Classification;
  /** One line for the notification, in Spanish. */
  summary: string;
  /** The `external_ref` was already captured: this is that transaction, unchanged. */
  isDuplicate: boolean;
  /** Merged into the other side of the same payment instead of creating a new one. */
  isMerged: boolean;
}

/**
 * Lo que la persona escribió, y debajo el aviso de que falta el monto.
 *
 * Wallet a veces agota su espera y manda la transacción sin valor; el aviso
 * es lo que hace que alguien le ponga la cifra. Con una nota de por medio no
 * se pierde ninguna de las dos cosas.
 */
export function notasDe(nota: string | undefined, monto: string | null): string | undefined {
  const partes = [
    nota?.trim() || null,
    monto === null ? 'Capturado sin valor: hay que ponerlo.' : null,
  ].filter((p): p is string => p !== null);
  return partes.length === 0 ? undefined : partes.join('\n');
}

export function idParaGuardar(c: ClasificacionInterpretada): number | undefined {
  // Alta: el concepto. Media: la categoría, si la hay —queda marcado para
  // revisar, pero ya está en el sitio correcto a medias—. Ninguna: nada.
  const id =
    c.certeza === 'alta'
      ? (c.conceptoId ?? c.categoriaId)
      : c.certeza === 'media'
        ? c.categoriaId
        : null;
  return id === null ? undefined : Number(id);
}

export function classificationOf(c: ClasificacionInterpretada): Classification {
  return {
    certainty: english(CERTAINTY, c.certeza),
    source: c.fuente === null ? null : english(CLASSIFICATION_SOURCE, c.fuente),
    conceptId: c.conceptoId === null ? null : BigInt(c.conceptoId),
    categoryId: c.categoriaId === null ? null : BigInt(c.categoriaId),
    name: c.nombre,
    candidates: c.candidatos.map((k) => ({ id: BigInt(k.id), name: k.nombre, path: k.ruta })),
    reason: c.motivo,
  };
}

export function interpretationOf(i: Interpretado): Interpretation {
  return {
    amount: i.monto,
    date: i.fecha,
    merchant: i.comercio,
    description: i.descripcion,
    classification: classificationOf(i.clasificacion),
    needsReview: i.porRevisar,
  };
}

export function hoyEnBogota(): string {
  return new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString().slice(0, 10);
}
