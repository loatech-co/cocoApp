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
        shape="square"
        isOver={false}
        isBusy={false}
        label="Agregar soportes"
        onPick={() => undefined}
      >
        <span className="pointer-events-none text-xs">Agregar</span>
      </DropSurface>
      <DropSurface
        shape="square"
        isOver
        isBusy={false}
        label="Agregar soportes"
        onPick={() => undefined}
      >
        <span className="pointer-events-none text-xs">Suelta aquí</span>
      </DropSurface>
      <DropSurface
        shape="square"
        isOver={false}
        isBusy
        label="Agregar soportes"
        onPick={() => undefined}
      >
        <span className="pointer-events-none text-xs">Subiendo…</span>
      </DropSurface>
      <div className="flex w-80">
        <DropSurface
          shape="full"
          isOver={false}
          isBusy={false}
          label="Agregar soportes"
          onPick={() => undefined}
        >
          <span className="pointer-events-none text-sm">Arrastra, elige o pega un archivo</span>
        </DropSurface>
      </div>
    </div>
  ),
};
