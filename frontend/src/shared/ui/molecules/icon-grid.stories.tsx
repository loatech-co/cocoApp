import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';

import { CATEGORY_ICONS } from '@/shared/ui/atoms/icons';

import { IconGrid } from './icon-grid';

/** The icon grid of a category. */
const meta: Meta = { title: 'Molecules/IconGrid' };

export default meta;
type Story = StoryObj;

/** Pressing the chosen one clears it. */
export const Playground: Story = {
  render: () => <Picker />,
};

function Picker() {
  const [valor, setValor] = useState<string | null>('house');
  return (
    <div className="w-96">
      <IconGrid filtrados={CATEGORY_ICONS} valor={valor} onElegir={setValor} />
    </div>
  );
}
