import { BadRequestException, Injectable, type PipeTransform } from '@nestjs/common';

/**
 * Convierte un parámetro de ruta a `bigint`.
 *
 * Las PK son BIGINT UNSIGNED. Usar `Number` las truncaría en silencio si algún
 * día pasaran de 2^53, y un id truncado apunta a OTRA fila — un bug de datos
 * que no avisa. Se rechaza cualquier cosa que no sea un entero positivo.
 */
@Injectable()
export class ParseBigIntPipe implements PipeTransform<string, bigint> {
  transform(value: string): bigint {
    if (!/^\d+$/.test(value)) {
      throw new BadRequestException('El identificador debe ser un número entero positivo.');
    }
    return BigInt(value);
  }
}
