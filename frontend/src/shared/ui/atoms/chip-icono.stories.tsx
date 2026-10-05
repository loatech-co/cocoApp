import type { Meta, StoryObj } from '@storybook/react-vite';
import { ArrowDownLeft, ArrowUpRight, ListChecks, PiggyBank } from 'lucide-react';

import { ChipIcono } from './chip-icono';

const meta = {
  title: 'Atoms/ChipIcono',
  component: ChipIcono,
  args: { Icono: ArrowUpRight, color: 'gasto', tamano: 'default' },
  argTypes: {
    color: { control: 'select', options: ['gasto', 'ingreso', 'presupuesto', 'movimientos'] },
    tamano: { control: 'inline-radio', options: ['sm', 'default'] },
  },
} satisfies Meta<typeof ChipIcono>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {};

/** Rule 5: the colours are named by their role, not by the hue they have today. */
export const Roles: Story = {
  render: () => (
    <div className="flex flex-col gap-4">
      {(['default', 'sm'] as const).map((tamano) => (
        <div key={tamano} className="flex gap-3">
          <ChipIcono Icono={ArrowUpRight} color="gasto" tamano={tamano} />
          <ChipIcono Icono={ArrowDownLeft} color="ingreso" tamano={tamano} />
          <ChipIcono Icono={PiggyBank} color="presupuesto" tamano={tamano} />
          <ChipIcono Icono={ListChecks} color="movimientos" tamano={tamano} />
        </div>
      ))}
    </div>
  ),
};
