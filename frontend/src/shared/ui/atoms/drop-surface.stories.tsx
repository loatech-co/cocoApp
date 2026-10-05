import type { Meta, StoryObj } from '@storybook/react-vite';

import { DropSurface } from './drop-surface';

/** The box where files are dropped or chosen. */
const meta: Meta = { title: 'Atoms/DropSurface' };

export default meta;
type Story = StoryObj;

/** Square and full; at rest, with something over it, and busy. */
export const States: Story = {
  render: () => (
    <div className="flex flex-wrap items-start gap-4">
      <DropSurface
        forma="cuadro"
        encima={false}
        ocupada={false}
        etiqueta="Agregar soportes"
        onPulsar={() => undefined}
      >
        <span className="pointer-events-none text-xs">Agregar</span>
      </DropSurface>
      <DropSurface
        forma="cuadro"
        encima
        ocupada={false}
        etiqueta="Agregar soportes"
        onPulsar={() => undefined}
      >
        <span className="pointer-events-none text-xs">Suelta aquí</span>
      </DropSurface>
      <DropSurface
        forma="cuadro"
        encima={false}
        ocupada
        etiqueta="Agregar soportes"
        onPulsar={() => undefined}
      >
        <span className="pointer-events-none text-xs">Subiendo…</span>
      </DropSurface>
      <div className="flex w-80">
        <DropSurface
          forma="completa"
          encima={false}
          ocupada={false}
          etiqueta="Agregar soportes"
          onPulsar={() => undefined}
        >
          <span className="pointer-events-none text-sm">Arrastra, elige o pega un archivo</span>
        </DropSurface>
      </div>
    </div>
  ),
};
