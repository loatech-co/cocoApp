import { ApiProperty } from '@nestjs/swagger';

import { TransactionResponse } from './transactions.response';

export class CandidateResponse {
  id!: number;
  nombre!: string;
  ruta!: string;
}

export class ClassificationResponse {
  @ApiProperty({ enum: ['alta', 'media', 'ninguna'] })
  certeza!: 'alta' | 'media' | 'ninguna';
  @ApiProperty({ enum: ['historial', 'palabras-clave', 'firma', 'diccionario'], nullable: true })
  fuente!: 'historial' | 'palabras-clave' | 'firma' | 'diccionario' | null;
  concepto_id!: number | null;
  categoria_id!: number | null;
  nombre!: string | null;
  candidatos!: CandidateResponse[];
  motivo!: string;
}

export class InterpretationResponse {
  amount!: string | null;
  date!: string | null;
  merchant!: string | null;
  description!: string | null;
  clasificacion!: ClassificationResponse;
  por_revisar!: boolean;
}

export class CaptureResponse {
  transaction!: TransactionResponse;
  clasificacion!: ClassificationResponse;
  resumen!: string;
  repetido!: boolean;
  fusionado!: boolean;
}
