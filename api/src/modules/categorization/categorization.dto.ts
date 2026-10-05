import { IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export class SuggestQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(255)
  description?: string;
}

/** Lo que la ficha manda al guardar un movimiento con una sugerencia aceptada o corregida. */
export class LearnBodyDto {
  @IsString()
  @MaxLength(255)
  description!: string;

  @IsInt()
  @Min(1)
  category_id!: number;
}
