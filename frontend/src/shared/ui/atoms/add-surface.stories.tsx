import type { Meta, StoryObj } from '@storybook/react-vite';

import { AddSurface } from './add-surface';

/** The dashed place where the next thing goes. */
const meta: Meta = { title: 'Atoms/AddSurface' };

export default meta;
type Story = StoryObj;

/** `hueco` alone, `barra` under what exists, `fila` inside a tile grid. */
export const Forms: Story = {
  render: () => (
    <div className="flex w-96 flex-col gap-4">
      <AddSurface shape="slot" onClick={() => undefined}>
        Agregar categoría
      </AddSurface>
      <AddSurface shape="bar" onClick={() => undefined}>
        Agregar categoría
      </AddSurface>
      <AddSurface shape="row" onClick={() => undefined}>
        Agregar atajo
      </AddSurface>
    </div>
  ),
};
