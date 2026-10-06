import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * The touch floor: 42px below the breakpoint.
 *
 * The product's sizes are drawn for a pointer —`sm` measures 36 and
 * `default` 40—. Apple says 44 and Material says 48, so 42 is the MINIMUM and
 * not the goal.
 *
 * ── This test is the place where the exceptions are declared ────────────────
 * An exception is GRANTED, not discovered. Each one is below with its reason;
 * a control below 42 that is not on that list is a failure.
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

/** Whoever draws a control declares it. Here is who "whoever draws" is. */
const CONTROLS: [filePath: string, what: string][] = [
  ['shared/ui/atoms/button.tsx', 'every button, in the base of the `cva`'],
  ['shared/ui/atoms/input.tsx', 'every text field'],
  ['shared/ui/organisms/select.tsx', 'the field that drops down a list, enabled and disabled'],
  ['shared/ui/molecules/menu.tsx', 'a menu option'],
  ['app/navegacion.tsx', 'a section row and the account trigger'],
  [
    'features/transactions/components/filtro-clasificacion.tsx',
    'the row with a checkbox: the row is the control',
  ],
];

/**
 * What goes below the floor, and why.
 *
 * It checks that the class is still there: if someone changes it, the test
 * fails and one has to go through this list again instead of through a
 * `className`.
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

describe('The touch floor', () => {
  it.each(CONTROLS)('%s declares it — %s', (filePath) => {
    const code = readFileSync(join(SRC_ROOT, filePath), 'utf8');
    expect(code).toContain(`movil:min-h-[${TOUCH_FLOOR_PX}px]`);
  });

  it.each(EXCEPTIONS)('%s stays below on purpose (%s)', (filePath, className) => {
    const code = readFileSync(join(SRC_ROOT, filePath), 'utf8');
    expect(code).toContain(className);
  });

  it('no phone floor is written below 42', () => {
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
