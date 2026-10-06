/** A receipt's record, without the file itself. */
export class ReceiptResponse {
  id!: number;
  orden!: number;
  nombre_archivo!: string;
  mime_type!: string;
  /** Bytes. */
  tamano!: number;
  /** Whether the file is actually in the store. */
  disponible!: boolean;
}
