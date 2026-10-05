import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';

import { ICONOS_DE_CATEGORIA } from '@/shared/ui/atoms/iconos';

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
      <IconGrid filtrados={ICONOS_DE_CATEGORIA} valor={valor} onElegir={setValor} />
    </div>
  );
}
