import type { Meta, StoryObj } from '@storybook/react-vite';
import { TrendingDown, TrendingUp } from 'lucide-react';

import { MenuRichOption } from './menu-rich-option';

/** A menu option with its coloured chip and a help line. */
const meta: Meta = { title: 'Molecules/MenuRichOption' };

export default meta;
type Story = StoryObj;

/** Available and disabled with its note. */
export const States: Story = {
  render: () => (
    <div className="flex w-72 flex-col rounded-lg bg-popover p-1">
      <MenuRichOption
        Icon={TrendingDown}
        color="expense"
        title="Gasto"
        description="Plata que sale"
        onClick={() => undefined}
      />
      <MenuRichOption
        Icon={TrendingUp}
        color="income"
        title="Ingreso"
        description="Plata que entra"
        note="Pronto"
        disabled
      />
    </div>
  ),
};
