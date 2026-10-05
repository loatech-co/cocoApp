import type { Meta, StoryObj } from '@storybook/react-vite';

import { SearchBox } from './search-box';

/** The box that narrows a list already on screen. */
const meta: Meta = { title: 'Atoms/SearchBox' };

export default meta;
type Story = StoryObj;

/** `cabecera` on top of a dropdown, `caja` inside a block. */
export const Forms: Story = {
  render: () => (
    <div className="flex w-80 flex-col gap-4">
      <div className="rounded-lg bg-popover">
        <SearchBox forma="cabecera" placeholder="Buscar…" aria-label="Buscar" />
      </div>
      <div className="rounded-lg bg-muted p-3">
        <SearchBox
          forma="caja"
          placeholder="Buscar: educación, mercado, salud…"
          aria-label="Buscar un icono"
        />
      </div>
    </div>
  ),
};
