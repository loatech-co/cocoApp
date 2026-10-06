import { transactionV1, type TransactionV1 } from './transactions.presenter';
import { CERTAINTY, CLASSIFICATION_SOURCE, spanish, type Spanish } from '../../common/vocabulary';
import type {
  Capture,
  Certainty,
  Classification,
  ClassificationSource,
  Interpretation,
} from '../../modules/interpretation/interpretation.domain';

interface ClassificationV1 {
  certeza: Spanish<typeof CERTAINTY, Certainty>;
  fuente: Spanish<typeof CLASSIFICATION_SOURCE, ClassificationSource> | null;
  concepto_id: bigint | null;
  categoria_id: bigint | null;
  nombre: string | null;
  candidatos: { id: bigint; nombre: string; ruta: string }[];
  motivo: string;
}

export interface InterpretationV1 {
  amount: string | null;
  date: string | null;
  merchant: string | null;
  description: string | null;
  clasificacion: ClassificationV1;
  por_revisar: boolean;
}

export interface CaptureV1 {
  transaction: TransactionV1;
  clasificacion: ClassificationV1;
  resumen: string;
  repetido: boolean;
  fusionado: boolean;
}

function classificationV1(c: Classification): ClassificationV1 {
  return {
    certeza: spanish(CERTAINTY, c.certainty),
    fuente: c.source === null ? null : spanish(CLASSIFICATION_SOURCE, c.source),
    concepto_id: c.conceptId,
    categoria_id: c.categoryId,
    nombre: c.name,
    candidatos: c.candidates.map((k) => ({ id: k.id, nombre: k.name, ruta: k.path })),
    motivo: c.reason,
  };
}

export function interpretationV1(i: Interpretation): InterpretationV1 {
  return {
    amount: i.amount,
    date: i.date,
    merchant: i.merchant,
    description: i.description,
    clasificacion: classificationV1(i.classification),
    por_revisar: i.needsReview,
  };
}

export function captureV1(c: Capture): CaptureV1 {
  return {
    transaction: transactionV1(c.transaction),
    clasificacion: classificationV1(c.classification),
    resumen: c.summary,
    repetido: c.isDuplicate,
    fusionado: c.isMerged,
  };
}
