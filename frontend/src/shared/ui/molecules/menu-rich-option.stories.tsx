import type { Meta, StoryObj } from '@storybook/react-vite';
import { TrendingDown, TrendingUp } from 'lucide-react';

import { MenuOpcionDetallada } from './menu-rich-option';

/** A menu option with its coloured chip and a help line. */
const meta: Meta = { title: 'Molecules/MenuOpcionDetallada' };

export default meta;
type Story = StoryObj;

/** Available and disabled with its note. */
export const States: Story = {
  render: () => (
    <div className="flex w-72 flex-col rounded-lg bg-popover p-1">
      <MenuOpcionDetallada
        Icono={TrendingDown}
        color="expense"
        titulo="Gasto"
        ayuda="Plata que sale"
        onClick={() => undefined}
      />
      <MenuOpcionDetallada
        Icono={TrendingUp}
        color="income"
        titulo="Ingreso"
        ayuda="Plata que entra"
        nota="Pronto"
        deshabilitada
      />
    </div>
  ),
};
