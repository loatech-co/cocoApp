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
        <BarSlotLink to="/" isExact label="Resumen" Icon={LayoutGrid} />
        <BarSlotButton label="Buscar" isOn onClick={() => undefined}>
          <BarIcon Icon={Search} />
        </BarSlotButton>
        <div className="flex w-18 shrink-0 items-start justify-center">
          <BarFab label="Registrar un gasto" onClick={() => undefined} />
        </div>
        <BarSlotButton label="Atajos" isOn={false} onClick={() => undefined}>
          <BarIcon Icon={LayoutGrid} />
        </BarSlotButton>
      </nav>
    </MemoryRouter>
  ),
};
