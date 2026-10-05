import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { SUPERFICIE_FLOTANTE } from './superficie';

/**
 * Todo lo que flota se dibuja igual.
 *
 * Esta regla ya se había roto una vez sin que nadie la rompiera a propósito:
 * diez archivos —los dos selectores de fecha, el menú, los tres modales, el
 * aviso, las dos pistas de las gráficas y el panel del teléfono— repetían la
 * misma pareja de clases, así que el día que se cambió de tema había diez
 * sitios que actualizar y se actualizaron cero.
 *
 * Lee el código fuente, como las de los botones y el radio, porque el problema
 * no está en el componente sino en quién escribe la clase.
 */
function fuentes(dir: string): string[] {
  return readdirSync(dir).flatMap((nombre) => {
    const ruta = join(dir, nombre);
    if (statSync(ruta).isDirectory()) return fuentes(ruta);
    return ruta.endsWith('.tsx') ? [ruta] : [];
  });
}

const archivos = fuentes(join(import.meta.dirname, '..', '..'));

const relativa = (ruta: string): string => ruta.split('/src/')[1]!;

/**
 * Quién puede escribir la sombra sin pasar por la superficie, y por qué.
 *
 * La diferencia es entre LEVANTAR y FLOTAR. Una superficie que flota trae su
 * propio color, su tinta, su sombra y su canto, y son esas cuatro decisiones
 * juntas las que tienen que estar en un solo sitio. Una sombra sola sobre algo
 * que YA tiene color no es una superficie: es un objeto de la página que se
 * levanta un momento —una ficha mientras se arrastra, el botón redondo de la
 * barra—, y obligarlo a traer el fondo de un desplegable lo volvería otra cosa.
 *
 * El tooltip está aquí porque va INVERTIDO a propósito: es la tinta de la
 * página haciendo de fondo, y el motivo está escrito en su propio archivo.
 */
const LEVANTAN = new Set([
  'components/atajos.tsx',
  'components/barra-inferior.tsx',
  'components/ui/tooltip.tsx',
]);

describe('La superficie de lo que flota está en un solo sitio', () => {
  it('encuentra los archivos del proyecto', () => {
    expect(archivos.length).toBeGreaterThan(10);
  });

  it('nadie vuelve a escribir la sombra flotante a mano', () => {
    const culpables = archivos
      .filter((ruta) => !LEVANTAN.has(relativa(ruta)))
      // La CLASE, no la mención: un comentario que explique la diferencia
      // entre lo apoyado y lo que flota nombra la sombra sin usarla.
      .filter((ruta) => readFileSync(ruta, 'utf8').includes('shadow-[var(--sombra-flotante)]'))
      .map(relativa);

    expect(culpables, 'usa SUPERFICIE_FLOTANTE de components/ui/superficie.ts').toEqual([]);
  });

  it('nadie separa un panel con un negro o un blanco inventados', () => {
    // `ring-black/5` sobre un popover blanco da #f2f2f2: dos puntos de
    // diferencia con el lienzo, o sea ningún canto. El borde del tema está
    // calculado para verse contra sus propias superficies, en los dos modos.
    const culpables: string[] = [];

    for (const ruta of archivos) {
      const codigo = readFileSync(ruta, 'utf8');
      for (const uso of codigo.matchAll(/\b(?:ring|border)-(?:black|white)\/\d+/g)) {
        culpables.push(`${relativa(ruta)}: ${uso[0]}`);
      }
    }

    expect(culpables, 'usa ring-border, o un token del tema').toEqual([]);
  });

  it('la superficie trae color, tinta, sombra y canto', () => {
    // Las cuatro, porque las cuatro se han olvidado alguna vez: ocho de los
    // diez sitios no declaraban `text-popover-foreground` y heredaban la tinta
    // de la página, que en otro tema no tiene por qué coincidir.
    expect(SUPERFICIE_FLOTANTE).toContain('bg-popover');
    expect(SUPERFICIE_FLOTANTE).toContain('text-popover-foreground');
    expect(SUPERFICIE_FLOTANTE).toContain('--sombra-flotante');
    expect(SUPERFICIE_FLOTANTE).toContain('ring-border');
  });
});
