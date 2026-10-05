import { IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export class SuggestQuery {
  /** The text to classify: a transaction's description. */
  @IsOptional()
  @IsString()
  @MaxLength(255)
  description?: string;
}

export class LearnInput {
  @IsString()
  @MaxLength(255)
  description!: string;

  /** The concept that text belongs to. */
  @IsInt()
  @Min(1)
  categoryId!: number;
}
