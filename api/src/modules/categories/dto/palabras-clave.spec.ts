// Los decoradores de `class-validator` leen metadatos, y quien los enciende es
// `reflect-metadata`. En la app lo carga Nest al arrancar; aquí no hay Nest.
import 'reflect-metadata';

import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { MAXIMO_DE_PALABRAS, UpdateCategoryDto } from './category.dto';
import { unir } from '../palabras-clave';

/**
 * Las palabras clave, en la puerta.
 *
 * La pantalla ya no deja escribir una repetida ni una vacía, pero la pantalla
 * no es la única que llama a esta API. Lo que aquí se comprueba es lo que pasa
 * cuando llega lo que la pantalla no habría mandado.
 */
async function comoLlega(
  palabras: unknown,
): Promise<{ dto: UpdateCategoryDto; errores: string[] }> {
  const dto = plainToInstance(UpdateCategoryDto, { palabras_clave: palabras });
  const errores = await validate(dto);
  return { dto, errores: errores.flatMap((e) => Object.values(e.constraints ?? {})) };
}

describe('palabras_clave', () => {
  it('recorta, aprieta los espacios y tira las vacías', async () => {
    const { dto, errores } = await comoLlega(['  Celsia ', '', '   ', 'Gases  de  Occidente']);

    expect(errores).toEqual([]);
    expect(dto.palabras_clave).toEqual(['Celsia', 'Gases de Occidente']);
  });

  it('quita las repetidas sin mirar tildes ni mayúsculas', async () => {
    // Guardar las dos haría que el clasificador sumara puntos dos veces por
    // una sola coincidencia.
    const { dto } = await comoLlega(['Energía', 'ENERGIA', 'energia ']);

    expect(dto.palabras_clave).toEqual(['Energía']);
  });

  it('una lista vacía las borra todas, y no es lo mismo que no mandar nada', async () => {
    const vacia = await comoLlega([]);
    expect(vacia.errores).toEqual([]);
    expect(vacia.dto.palabras_clave).toEqual([]);

    const sinCampo = plainToInstance(UpdateCategoryDto, {});
    expect(sinCampo.palabras_clave).toBeUndefined();
  });

  it('rechaza lo que no es una lista de textos', async () => {
    expect((await comoLlega('Celsia')).errores.join(' ')).toContain('array');
    expect((await comoLlega([1, 2])).errores.join(' ')).toContain('string');
  });

  it('rechaza una lista interminable y una palabra interminable', async () => {
    const muchas = Array.from({ length: MAXIMO_DE_PALABRAS + 1 }, (_, i) => `palabra${i}`);
    expect((await comoLlega(muchas)).errores.join(' ')).toContain(String(MAXIMO_DE_PALABRAS));

    expect((await comoLlega(['x'.repeat(61)])).errores.join(' ')).toContain('60');
  });
});

describe('unir', () => {
  it('junta dos listas sin repetir y respetando el orden en que llegaron', () => {
    // Es lo que pasa al unificar dos conceptos: las del que queda van primero
    // y las del que desaparece se añaden detrás. La ficha tiene que seguir
    // enseñando la lista que se escribió, no una reordenada.
    expect(unir(['Celsia', 'EPSA'], ['celsia', '805027653'])).toEqual([
      'Celsia',
      'EPSA',
      '805027653',
    ]);
  });

  it('aguanta listas vacías por los dos lados', () => {
    expect(unir([], [])).toEqual([]);
    expect(unir(['Celsia'], [])).toEqual(['Celsia']);
  });
});
