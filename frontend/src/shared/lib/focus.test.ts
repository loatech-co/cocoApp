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
function sourceFiles(dir: string, ext: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path, ext);
    return path.endsWith(ext) && !path.includes('.test.') ? [path] : [];
  });
}

const SRC = join(import.meta.dirname, '..', '..');
const components = sourceFiles(SRC, '.tsx');
/*
  Las clases de foco también se escriben en archivos `.ts` sin marcado:
  `FOCO_DEL_CAMPO` vive en `shared/ui/foundations/field.ts`. Las dos pruebas
  de la señal miran los dos tipos de archivo; las del foco que se mueve solo
  miran componentes, que es donde se monta algo.
*/
const withClasses = [...components, ...sourceFiles(SRC, '.ts')];
const relative = (path: string): string => path.split('/src/')[1]!;

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
const BORN_FOCUSED: Record<string, string> = {
  'app/atajos.tsx':
    'La paleta de páginas: se abre para escribir el nombre de una, y no tiene ningún otro control.',
  'features/transactions/components/toolbar-filtros.tsx':
    'La caja de búsqueda aparece al pulsar la lupa. Es el mismo gesto.',
  'features/transactions/components/panel-de-busqueda.tsx':
    'La hoja de buscar del teléfono: se levanta al tocar la lupa de la barra de abajo, y el campo es lo único que tiene.',
  'shared/ui/organisms/combo.tsx':
    'El filtro de un desplegable con muchas opciones: si hay que pulsarlo antes de escribir, nadie descubre que se podía filtrar.',
  'features/transactions/components/buscador-de-concepto.tsx':
    'El buscador de conceptos de la ficha: se abre para escribir, como el filtro de un Combo, y la caja es lo primero que hay dentro.',
};

/**
 * `focus:` que NO son la señal de foco, y por eso se permiten.
 *
 * El marcador de un campo aparece cuando hay un cursor dentro —da igual quién
 * lo haya puesto— porque en reposo su sitio lo ocupa la etiqueta flotante. No
 * dice «esto está enfocado»: dice «aquí cabe esto».
 */
const NOT_A_SIGNAL = ['focus:placeholder:text-muted-foreground'];

const css = readFileSync(join(SRC, 'index.css'), 'utf8');

/**
 * Quién puede dibujar un anillo de foco, y por qué NO es un botón.
 *
 * Un botón se pulsa y pasa algo: no guarda nada ni recibe lo que se escribe,
 * así que no hay nada que señalar en él. Y el foco le vuelve solo cada vez que
 * se cierra lo que abrió —una ficha, un desplegable—, con lo que el contorno
 * aparecía al SALIR de otra cosa, que es lo contrario de lo que un contorno de
 * foco tiene que decir.
 *
 * Lo llevan los que sí guardan algo, y los que sin él no se pueden recorrer.
 */
const HAVE_RING: Record<string, string> = {
  'shared/ui/foundations/field.ts':
    'Un campo sí: hace falta saber cuál está recibiendo lo que se teclea. Es `FOCO_DEL_CAMPO`, y un desplegable es un campo aunque esté hecho con un <button>.',
  'shared/ui/atoms/input.tsx': 'El del error, que va a plena tinta.',
  'shared/ui/atoms/textarea.tsx': 'El del error, que va a plena tinta.',
  'shared/ui/atoms/checkbox.tsx': 'Una casilla es un <input> y guarda un estado.',
  'shared/ui/atoms/switch.tsx': 'Un interruptor es un <input> y guarda un estado.',
  'features/transactions/components/tendencia.tsx':
    'La gráfica entra en el orden del tabulador y se recorre con las flechas: sin anillo, quien llega con el teclado no sabe que está ahí.',
};

describe('Nada nace enfocado', () => {
  it('solo los buscadores llevan autoFocus, y están justificados', () => {
    const culprits = components
      // El atributo, no la palabra: los comentarios que explican por qué NO lo
      // llevan lo nombran entre acentos graves, y sin esto se delatan solos.
      .filter((path) => /(?<!`)\bautoFocus\b(?!`)/.test(readFileSync(path, 'utf8')))
      .map(relative)
      .filter((path) => !(path in BORN_FOCUSED));

    expect(culprits, 'Un campo no se enciende solo: quita el `autoFocus`').toEqual([]);
  });

  it('solo los buscadores mueven el foco a mano', () => {
    const culprits = components
      .filter((path) => readFileSync(path, 'utf8').includes('.focus()'))
      .map(relative)
      .filter((path) => !(path in BORN_FOCUSED));

    expect(culprits, 'Mover el foco al abrir algo enciende lo que nadie eligió').toEqual([]);
  });
});

describe('La señal de foco se escribe con :focus-visible', () => {
  it('ningún componente la pinta con `focus:`', () => {
    const culprits = withClasses.flatMap((path) => {
      const found = readFileSync(path, 'utf8').match(/(?<!-visible|-within)\bfocus:[\w:[\]./-]+/g);
      return (found ?? [])
        .filter((className) => !NOT_A_SIGNAL.includes(className))
        .map((className) => `${relative(path)} → ${className}`);
    });

    expect(
      culprits,
      '`focus:` se enciende también con el foco que pone el programa. Usa `focus-visible:`',
    ).toEqual([]);
  });

  it('ningún botón dibuja un anillo de foco', () => {
    const culprits = withClasses
      .filter((path) => /focus-visible:(?:ring|border)/.test(readFileSync(path, 'utf8')))
      .map(relative)
      .filter((path) => !(path in HAVE_RING));

    expect(culprits, 'Un botón se pulsa y pasa algo: no guarda nada que haya que señalar').toEqual(
      [],
    );
  });

  it('y la regla base de la hoja los exime del contorno', () => {
    // Sin esto no habría hecho falta quitar ni un anillo: el contorno de dos
    // píxeles de `:focus-visible` lo dibuja la capa base sobre CUALQUIER cosa
    // que reciba el foco, y es el que se veía en el botón de agregar categoría.
    expect(css).toMatch(/button:focus-visible\s*\{\s*outline:\s*none/);
  });
});

describe('La etiqueta flotante separa subir de teñirse', () => {
  it('sube con :focus-within, porque si no el texto se pisa', () => {
    expect(css).toContain('.campo:focus-within > label');
  });

  it('se tiñe con :focus-visible, porque eso ya es la señal', () => {
    expect(css).toContain('.campo:has(:focus-visible) > label');
    expect(css).not.toContain('.campo:focus-within > label {\n    color:');
  });
});
