import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * El foco se PINTA cuando se pide, y nunca antes.
 *
 * Es una regla que no se rompe de frente: nadie escribe «enciende este campo
 * al abrir la ficha». Se rompe con un `autoFocus` puesto para ahorrar un clic
 * y con un `focus:` escrito por costumbre donde iba `focus-visible:`, y el
 * resultado es el mismo en los dos casos —una pantalla que se abre con algo
 * encendido que nadie eligió—. Por eso se lee el código fuente.
 *
 * Lo que la regla NO dice es dónde está el cursor. Un panel atrapa el foco
 * dentro de sí aunque no pinte nada; un campo sube su etiqueta en cuanto hay
 * un cursor en él, lo haya puesto quien lo haya puesto. Lo que se prohíbe es
 * la SEÑAL: el anillo, el borde teñido, la etiqueta verde.
 */
function fuentes(dir: string, ext: string): string[] {
  return readdirSync(dir).flatMap((nombre) => {
    const ruta = join(dir, nombre);
    if (statSync(ruta).isDirectory()) return fuentes(ruta, ext);
    return ruta.endsWith(ext) && !ruta.includes('.test.') ? [ruta] : [];
  });
}

const SRC = join(import.meta.dirname, '..');
const archivos = fuentes(SRC, '.tsx');
const relativa = (ruta: string): string => ruta.split('/src/')[1]!;

/**
 * Quién puede nacer enfocado, y por qué.
 *
 * La excepción no es «un campo importante»: es un BUSCADOR que aparece porque
 * se pidió buscar. Ahí el campo no se abre con la pantalla —se abre con el
 * gesto— y pedir buscar y tener que pulsar además la caja son dos gestos para
 * una sola intención.
 *
 * Un formulario no entra nunca. Una ficha se abre para leerla antes que para
 * rellenarla, y el campo que el programa decida encender no tiene por qué ser
 * el que se venía a cambiar.
 */
const NACEN_ENFOCADOS: Record<string, string> = {
  'components/atajos.tsx':
    'La paleta de páginas: se abre para escribir el nombre de una, y no tiene ningún otro control.',
  'components/toolbar-filtros.tsx':
    'La caja de búsqueda aparece al pulsar la lupa. Es el mismo gesto.',
  'components/ui/combo.tsx':
    'El filtro de un desplegable con muchas opciones: si hay que pulsarlo antes de escribir, nadie descubre que se podía filtrar.',
};

/**
 * `focus:` que NO son la señal de foco, y por eso se permiten.
 *
 * El marcador de un campo aparece cuando hay un cursor dentro —da igual quién
 * lo haya puesto— porque en reposo su sitio lo ocupa la etiqueta flotante. No
 * dice «esto está enfocado»: dice «aquí cabe esto».
 */
const NO_SON_SENAL = ['focus:placeholder:text-muted-foreground'];

describe('Nada nace enfocado', () => {
  it('solo los buscadores llevan autoFocus, y están justificados', () => {
    const culpables = archivos
      // El atributo, no la palabra: los comentarios que explican por qué NO lo
      // llevan lo nombran entre acentos graves, y sin esto se delatan solos.
      .filter((ruta) => /(?<!`)\bautoFocus\b(?!`)/.test(readFileSync(ruta, 'utf8')))
      .map(relativa)
      .filter((ruta) => !(ruta in NACEN_ENFOCADOS));

    expect(culpables, 'Un campo no se enciende solo: quita el `autoFocus`').toEqual([]);
  });

  it('solo los buscadores mueven el foco a mano', () => {
    const culpables = archivos
      .filter((ruta) => /\.focus\(\)/.test(readFileSync(ruta, 'utf8')))
      .map(relativa)
      .filter((ruta) => !(ruta in NACEN_ENFOCADOS));

    expect(culpables, 'Mover el foco al abrir algo enciende lo que nadie eligió').toEqual([]);
  });
});

describe('La señal de foco se escribe con :focus-visible', () => {
  it('ningún componente la pinta con `focus:`', () => {
    const culpables = archivos.flatMap((ruta) => {
      const encontrados = readFileSync(ruta, 'utf8').match(
        /(?<!-visible|-within)\bfocus:[\w:[\]./-]+/g,
      );
      return (encontrados ?? [])
        .filter((clase) => !NO_SON_SENAL.includes(clase))
        .map((clase) => `${relativa(ruta)} → ${clase}`);
    });

    expect(
      culpables,
      '`focus:` se enciende también con el foco que pone el programa. Usa `focus-visible:`',
    ).toEqual([]);
  });

  it('el anillo de un campo está en un solo sitio', () => {
    const culpables = archivos
      .filter((ruta) => /focus-visible:ring-ring\b/.test(readFileSync(ruta, 'utf8')))
      .map(relativa)
      // Los controles que NO son campos —un botón, una casilla, una fila de
      // una tabla— traen su propio anillo: el suyo va por fuera y con
      // separación, porque no tienen un borde que teñir.
      .filter((ruta) => ['components/ui/input.tsx', 'components/ui/textarea.tsx'].includes(ruta));

    expect(culpables, 'El anillo de un campo sale de `FOCO_DEL_CAMPO`, en `ui/campo.tsx`').toEqual(
      [],
    );
  });
});

describe('La etiqueta flotante separa subir de teñirse', () => {
  const css = readFileSync(join(SRC, 'index.css'), 'utf8');

  it('sube con :focus-within, porque si no el texto se pisa', () => {
    expect(css).toContain('.campo:focus-within > label');
  });

  it('se tiñe con :focus-visible, porque eso ya es la señal', () => {
    expect(css).toContain('.campo:has(:focus-visible) > label');
    expect(css).not.toContain('.campo:focus-within > label {\n    color:');
  });
});
