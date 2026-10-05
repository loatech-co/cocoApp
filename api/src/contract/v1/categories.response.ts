import { ApiProperty } from '@nestjs/swagger';
import { CategoryKind, Periodicidad } from '@prisma/client';

/** What every category carries, whatever its level (cost center, category, concept). */
class CategoryFields {
  id!: number;
  name!: string;
  @ApiProperty({ enum: CategoryKind })
  kind!: CategoryKind;
  color!: string | null;
  icon!: string | null;
  sort_order!: number;
  is_archived!: boolean;
  /** Whether the concept is paid every so often. */
  recurrente!: boolean;
  /** Whether the cost center refuses reclassification from the transactions table. */
  estatico!: boolean;
  @ApiProperty({ enum: Periodicidad, nullable: true })
  periodicidad!: Periodicidad | null;
  /** Day of the month it is due. */
  dia_de_pago!: number | null;
  /** Reference month of the cycle, 1–12. Only when the periodicity is not monthly. */
  mes_de_pago!: number | null;
  /** Expected cost each time, as a decimal string. */
  presupuesto!: string | null;
  /** Whether the transaction is created on its own on the due day. */
  pago_automatico!: boolean;
  /** Whether it is paid in several parts rather than settled at once. */
  varios_pagos!: boolean;
  /** Words looked for in a receipt to recognise this concept. */
  palabras_clave!: string[];
}

/** A category as the categories routes return it, with its subtree when listed. */
export class CategoryResponse extends CategoryFields {
  parent_id!: number | null;
  /** Present in the list (the tree), absent on a single category. */
  children?: CategoryResponse[];
}

/**
 * A category as `POST /categories/{id}/unificar` returns its destination:
 * that route hands out the service's view untouched, so the parent goes as
 * `parentId`. Documented as it is; v2 fixes it.
 */
export class CategoryRecordResponse extends CategoryFields {
  parentId!: number | null;
}

export class CategoryMergeResponse {
  /** Transactions moved to the destination. */
  movidos!: number;
  destino!: CategoryRecordResponse;
}

export class CategoryUsageResponse {
  movimientos!: number;
  subcategorias!: number;
}

export class CategorySeedResponse {
  creadas!: number;
}
