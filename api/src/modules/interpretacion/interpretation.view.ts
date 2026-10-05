/** What the interpretation endpoints answer, and the pure helpers that build it. */
import type { ClasificacionInterpretada, Interpretado } from './interpretar';
import type { TransactionView } from '../transactions/transactions.service';

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

export function clasificacionAVista(c: ClasificacionInterpretada): ClasificacionView {
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

export function aVista(i: Interpretado): InterpretacionView {
  return {
    amount: i.monto,
    date: i.fecha,
    merchant: i.comercio,
    description: i.descripcion,
    clasificacion: clasificacionAVista(i.clasificacion),
    por_revisar: i.porRevisar,
  };
}

export function hoyEnBogota(): string {
  return new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString().slice(0, 10);
}
