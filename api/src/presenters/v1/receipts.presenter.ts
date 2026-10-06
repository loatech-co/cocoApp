import type { Receipt } from '../../modules/soportes/soportes.service';

export interface ReceiptV1 {
  id: bigint;
  orden: number;
  nombre_archivo: string;
  mime_type: string;
  tamano: number;
  disponible: boolean;
}

export function receiptV1(r: Receipt): ReceiptV1 {
  return {
    id: r.id,
    orden: r.position,
    nombre_archivo: r.fileName,
    mime_type: r.mimeType,
    tamano: r.sizeBytes,
    disponible: r.isAvailable,
  };
}
