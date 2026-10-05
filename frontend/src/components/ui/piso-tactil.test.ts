import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * El suelo táctil: 42px por debajo del corte.
 *
 * Los tamaños del producto están dibujados para un puntero —`sm` mide 36 y
 * `default` 40—. Apple dice 44 y Material dice 48, así que 42 es el MÍNIMO y
 * no la meta.
 *
 * ── Esta prueba es el sitio donde se declaran las excepciones ───────────────
 * Una excepción se CONCEDE, no se descubre. Cada una está abajo con su razón;
 * un control por debajo de 42 que no esté en esa lista es un fallo.
 */
const PISO = 42;

function fuentes(dir: string): string[] {
  return readdirSync(dir).flatMap((nombre) => {
    const ruta = join(dir, nombre);
    if (statSync(ruta).isDirectory()) return fuentes(ruta);
    return ruta.endsWith('.tsx') ? [ruta] : [];
  });
}

const RAIZ = join(import.meta.dirname, '..', '..');

/** Quien dibuja un control lo declara. Aquí está quién es "quien dibuja". */
const CONTROLES: [ruta: string, que: string][] = [
  ['components/ui/button.tsx', 'todos los botones, en la base del `cva`'],
  ['components/ui/input.tsx', 'todos los campos de texto'],
  ['components/ui/select.tsx', 'el campo que despliega una lista, encendido y apagado'],
  ['components/menu.tsx', 'la opción de un menú'],
  ['components/navegacion.tsx', 'la fila de una sección y el disparador de la cuenta'],
  ['components/filtro-clasificacion.tsx', 'la fila con casilla: la fila es el control'],
];

/**
 * Lo que va por debajo del suelo, y por qué.
 *
 * Se comprueba que la clase siga ahí: si alguien la cambia, la prueba falla y
 * hay que volver a pasar por esta lista en vez de por un `className`.
 */
const EXCEPCIONES: [ruta: string, clase: string, razon: string][] = [
  [
    'components/atajos.tsx',
    'size-6',
    'el menos de una baldosa mide 24: se llega a él dentro de un modo al que se entra manteniendo pulsada la baldosa, y uno mayor se pulsaría al arrastrar',
  ],
  [
    'components/panel-inferior.tsx',
    'h-[5px] w-[72px]',
    'el tirador es un INDICADOR, no un control: el gesto se lee en todo el panel, no encima de la raya',
  ],
  [
    'components/ui/casilla.tsx',
    'size-4',
    'el recuadro mide 16, pero vive dentro de una fila que sí tiene suelo y que lo alterna entera',
  ],
];

describe('El suelo táctil', () => {
  it.each(CONTROLES)('%s lo declara — %s', (ruta) => {
    const codigo = readFileSync(join(RAIZ, ruta), 'utf8');
    expect(codigo).toContain(`movil:min-h-[${PISO}px]`);
  });

  it.each(EXCEPCIONES)('%s se queda debajo a propósito (%s)', (ruta, clase) => {
    const codigo = readFileSync(join(RAIZ, ruta), 'utf8');
    expect(codigo).toContain(clase);
  });

  it('ningún suelo del teléfono se escribe por debajo de 42', () => {
    const culpables: string[] = [];

    for (const ruta of fuentes(RAIZ)) {
      const codigo = readFileSync(ruta, 'utf8');
      for (const uso of codigo.matchAll(/movil:min-(?:h|w)-\[(\d+)px\]/g)) {
        if (Number(uso[1]) < PISO) culpables.push(`${ruta.split('/src/')[1]}: ${uso[0]}`);
      }
    }

    expect(culpables, culpables.join('\n')).toEqual([]);
  });
});
