import type { Meta, StoryObj } from '@storybook/react-vite';

import { CollapsibleHeader } from './collapsible-header';

/** The header of a card that folds. */
const meta: Meta = { title: 'Atoms/CollapsibleHeader' };

export default meta;
type Story = StoryObj;

/** Closed and open. */
export const States: Story = {
  render: () => (
    <div className="flex w-96 flex-col gap-2">
      <div className="flex rounded-lg bg-card">
        <CollapsibleHeader abierta={false} onAlternar={() => undefined}>
          <span className="truncate text-lg font-semibold">Hogar</span>
        </CollapsibleHeader>
      </div>
      <div className="flex rounded-lg bg-card">
        <CollapsibleHeader abierta onAlternar={() => undefined}>
          <span className="truncate text-lg font-semibold">Costos fijos</span>
        </CollapsibleHeader>
      </div>
    </div>
  ),
};
