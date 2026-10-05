import type { Meta, StoryObj } from '@storybook/react-vite';

import { RailToggle } from './rail-toggle';

/** Folding and unfolding the desktop rail. */
const meta: Meta = { title: 'Atoms/RailToggle' };

export default meta;
type Story = StoryObj;

/** Unfolded (next to the logo) and folded (full width of the rail). */
export const States: Story = {
  render: () => (
    <div className="flex gap-6 bg-sidebar p-3">
      <div className="flex w-56 items-center justify-between">
        <span className="text-sm">Coco</span>
        <RailToggle plegada={false} onAlternar={() => undefined} />
      </div>
      <div className="w-16">
        <RailToggle plegada onAlternar={() => undefined} />
      </div>
    </div>
  ),
};
