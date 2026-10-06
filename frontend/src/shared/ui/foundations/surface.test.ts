import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { FLOATING_SURFACE } from './surface';

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
function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const filePath = join(dir, entry);
    if (statSync(filePath).isDirectory()) return sourceFiles(filePath);
    return filePath.endsWith('.tsx') ? [filePath] : [];
  });
}

const files = sourceFiles(join(import.meta.dirname, '..', '..', '..'));

const relativePath = (filePath: string): string => filePath.split('/src/')[1]!;

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
const LIFTED = new Set([
  'shared/ui/atoms/tile.tsx',
  'shared/ui/atoms/bar-slot.tsx',
  'shared/ui/atoms/tooltip.tsx',
]);

describe('La superficie de lo que flota está en un solo sitio', () => {
  it('encuentra los archivos del proyecto', () => {
    expect(files.length).toBeGreaterThan(10);
  });

  it('nadie vuelve a escribir la sombra flotante a mano', () => {
    const offenders = files
      .filter((filePath) => !LIFTED.has(relativePath(filePath)))
      // La CLASE, no la mención: un comentario que explique la diferencia
      // entre lo apoyado y lo que flota nombra la sombra sin usarla.
      .filter((filePath) =>
        readFileSync(filePath, 'utf8').includes('shadow-[var(--sombra-flotante)]'),
      )
      .map(relativePath);

    expect(offenders, 'usa SUPERFICIE_FLOTANTE de shared/ui/foundations/surface.ts').toEqual([]);
  });

  it('nadie separa un panel con un negro o un blanco inventados', () => {
    // `ring-black/5` sobre un popover blanco da #f2f2f2: dos puntos de
    // diferencia con el lienzo, o sea ningún canto. El borde del tema está
    // calculado para verse contra sus propias superficies, en los dos modos.
    const offenders: string[] = [];

    for (const filePath of files) {
      const code = readFileSync(filePath, 'utf8');
      for (const match of code.matchAll(/\b(?:ring|border)-(?:black|white)\/\d+/g)) {
        offenders.push(`${relativePath(filePath)}: ${match[0]}`);
      }
    }

    expect(offenders, 'usa ring-border, o un token del tema').toEqual([]);
  });

  it('la superficie trae color, tinta, sombra y canto', () => {
    // Las cuatro, porque las cuatro se han olvidado alguna vez: ocho de los
    // diez sitios no declaraban `text-popover-foreground` y heredaban la tinta
    // de la página, que en otro tema no tiene por qué coincidir.
    expect(FLOATING_SURFACE).toContain('bg-popover');
    expect(FLOATING_SURFACE).toContain('text-popover-foreground');
    expect(FLOATING_SURFACE).toContain('--sombra-flotante');
    expect(FLOATING_SURFACE).toContain('ring-border');
  });
});
