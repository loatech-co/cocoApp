import type { Meta, StoryObj } from '@storybook/react-vite';

import { CardRow } from './card-row';

/** A pressable row of a list inside a card. */
const meta: Meta = { title: 'Atoms/CardRow' };

export default meta;
type Story = StoryObj;

/** With `onClick` it answers the pointer; without it, it stays still. */
export const States: Story = {
  render: () => (
    <div className="flex w-80 flex-col rounded-lg bg-card p-2">
      <CardRow onClick={() => undefined}>
        <span className="text-sm">Arriendo · se puede registrar</span>
      </CardRow>
      <CardRow>
        <span className="text-sm">Internet · solo lectura</span>
      </CardRow>
    </div>
  ),
};
