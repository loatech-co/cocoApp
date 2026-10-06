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
const TOUCH_FLOOR_PX = 42;

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const filePath = join(dir, entry);
    if (statSync(filePath).isDirectory()) return sourceFiles(filePath);
    return filePath.endsWith('.tsx') ? [filePath] : [];
  });
}

const SRC_ROOT = join(import.meta.dirname, '..', '..');

/** Quien dibuja un control lo declara. Aquí está quién es "quien dibuja". */
const CONTROLS: [filePath: string, what: string][] = [
  ['shared/ui/atoms/button.tsx', 'todos los botones, en la base del `cva`'],
  ['shared/ui/atoms/input.tsx', 'todos los campos de texto'],
  ['shared/ui/organisms/select.tsx', 'el campo que despliega una lista, encendido y apagado'],
  ['shared/ui/molecules/menu.tsx', 'la opción de un menú'],
  ['app/navegacion.tsx', 'la fila de una sección y el disparador de la cuenta'],
  [
    'features/transactions/components/filtro-clasificacion.tsx',
    'la fila con casilla: la fila es el control',
  ],
];

/**
 * Lo que va por debajo del suelo, y por qué.
 *
 * Se comprueba que la clase siga ahí: si alguien la cambia, la prueba falla y
 * hay que volver a pasar por esta lista en vez de por un `className`.
 */
const EXCEPTIONS: [filePath: string, className: string, reason: string][] = [
  [
    'shared/ui/atoms/tile.tsx',
    'size-6',
    'el menos de una baldosa mide 24: se llega a él dentro de un modo al que se entra manteniendo pulsada la baldosa, y uno mayor se pulsaría al arrastrar',
  ],
  [
    'shared/ui/atoms/bottom-sheet.tsx',
    'h-[5px] w-[72px]',
    'el tirador es un INDICADOR, no un control: el gesto se lee en todo el panel, no encima de la raya',
  ],
  [
    'shared/ui/atoms/checkbox.tsx',
    'size-4',
    'el recuadro mide 16, pero vive dentro de una fila que sí tiene suelo y que lo alterna entera',
  ],
];

describe('El suelo táctil', () => {
  it.each(CONTROLS)('%s lo declara — %s', (filePath) => {
    const code = readFileSync(join(SRC_ROOT, filePath), 'utf8');
    expect(code).toContain(`movil:min-h-[${TOUCH_FLOOR_PX}px]`);
  });

  it.each(EXCEPTIONS)('%s se queda debajo a propósito (%s)', (filePath, className) => {
    const code = readFileSync(join(SRC_ROOT, filePath), 'utf8');
    expect(code).toContain(className);
  });

  it('ningún suelo del teléfono se escribe por debajo de 42', () => {
    const offenders: string[] = [];

    for (const filePath of sourceFiles(SRC_ROOT)) {
      const code = readFileSync(filePath, 'utf8');
      for (const match of code.matchAll(/movil:min-(?:h|w)-\[(\d+)px\]/g)) {
        if (Number(match[1]) < TOUCH_FLOOR_PX)
          offenders.push(`${filePath.split('/src/')[1]}: ${match[0]}`);
      }
    }

    expect(offenders, offenders.join('\n')).toEqual([]);
  });
});
