import { IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

const HEX = /^#[0-9A-Fa-f]{6}$/;

export class UpsertTagDto {
  @IsString()
  @MinLength(1, { message: 'El nombre de la etiqueta no puede estar vacío.' })
  @MaxLength(255)
  name!: string;

  @IsOptional()
  @Matches(HEX, { message: 'El color debe ser hexadecimal, formato #RRGGBB.' })
  color?: string;
}
