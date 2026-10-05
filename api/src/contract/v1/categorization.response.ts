import { ApiProperty } from '@nestjs/swagger';

export class SuggestionResponse {
  category_id!: number;
  /** 0–100. */
  confidence!: number;
  @ApiProperty({ enum: ['historial', 'regla', 'regla-sembrada'] })
  reason!: 'historial' | 'regla' | 'regla-sembrada';
}

export class LearnResponse {
  aprendido!: boolean;
}
