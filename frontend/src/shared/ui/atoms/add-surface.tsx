import { Plus } from 'lucide-react';
import type { ReactNode } from 'react';

import { cn } from '@/shared/lib/utils';
import { REALCE_DE_SUPERFICIE } from '@/shared/ui/foundations/superficie';

/**
 * El hueco punteado donde va a ir lo siguiente: «Agregar categoría»,
 * «Agregar atajo». Un más y una frase, a todo el ancho.
 *
 * | Forma   | Dónde                                                          |
 * | ------- | -------------------------------------------------------------- |
 * | `hueco` | Lo ÚNICO que hay —un centro sin categorías—: alto y apilado    |
 * | `barra` | Debajo de lo que ya hay: el icono y el texto en una fila       |
 * | `fila`  | Dentro de una rejilla de baldosas: trazo fino y el suelo táctil |
 *
 * Sin categorías, el hueco no es una baldosa más: es el sitio donde va a
 * empezar la estructura, y `min-h-64` (256px, el escalón de la escala) lo dice.
 * Con algo encima es una barra: apilado y alto sería un rectángulo punteado
 * más grande que cualquiera de las tarjetas, y lo que hay que mirar son ellas.
 *
 * Las dos grandes responden con `REALCE_DE_SUPERFICIE`, el realce bajo de las
 * superficies grandes (el porqué está en `superficie.ts`): el acento entero en
 * mil por doscientos cincuenta píxeles es un fogonazo.
 */
const SHAPES = {
  slot: cn('min-h-64 flex-col gap-2 border-2 p-4', REALCE_DE_SUPERFICIE),
  bar: cn('gap-2 border-2 p-4', REALCE_DE_SUPERFICIE),
  row: 'min-h-[42px] gap-2 border py-3 hover:bg-muted',
} as const;

export function AddSurface({
  shape,
  onClick,
  children,
}: {
  shape: keyof typeof SHAPES;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex w-full items-center justify-center rounded-lg border-dashed border-border text-center',
        'text-sm font-medium text-muted-foreground transition-colors',
        SHAPES[shape],
      )}
    >
      <Plus className={cn('shrink-0', shape === 'row' ? 'size-4' : 'size-5')} aria-hidden="true" />
      {children}
    </button>
  );
}
