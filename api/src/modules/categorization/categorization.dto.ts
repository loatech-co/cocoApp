import { IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export class SuggestQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(255)
  description?: string;
}

/** What the form sends when it saves a transaction with an accepted or corrected suggestion. */
export class LearnBodyDto {
  @IsString()
  @MaxLength(255)
  description!: string;

  @IsInt()
  @Min(1)
  category_id!: number;
}
