import type { Meta, StoryObj } from '@storybook/react-vite';
import { LayoutGrid, Search } from 'lucide-react';
import { MemoryRouter } from 'react-router-dom';

import { BarFab, BarIcon, BarSlotButton, BarSlotLink } from './bar-slot';

/** The slots of the phone bottom bar. */
const meta: Meta = { title: 'Atoms/BarSlot' };

export default meta;
type Story = StoryObj;

/** A link, two buttons (one on) and the action in the middle. */
export const Bar: Story = {
  render: () => (
    <MemoryRouter initialEntries={['/']}>
      <nav className="flex w-96 items-stretch bg-sidebar pt-6">
        <BarSlotLink to="/" exact etiqueta="Resumen" Icono={LayoutGrid} />
        <BarSlotButton etiqueta="Buscar" encendido onClick={() => undefined}>
          <BarIcon Icono={Search} />
        </BarSlotButton>
        <div className="flex w-18 shrink-0 items-start justify-center">
          <BarFab etiqueta="Registrar un gasto" onClick={() => undefined} />
        </div>
        <BarSlotButton etiqueta="Atajos" encendido={false} onClick={() => undefined}>
          <BarIcon Icono={LayoutGrid} />
        </BarSlotButton>
      </nav>
    </MemoryRouter>
  ),
};
