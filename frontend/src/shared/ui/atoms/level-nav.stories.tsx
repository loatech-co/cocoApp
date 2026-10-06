import type { Meta, StoryObj } from '@storybook/react-vite';

import { BackCrumb, DrillButton } from './level-nav';

/** Going up and down a tree of levels inside a list. */
const meta: Meta = { title: 'Atoms/LevelNav' };

export default meta;
type Story = StoryObj;

/** The way back, with the levels walked; `fuerte` where it titles a dropdown. */
export const Back: Story = {
  render: () => (
    <div className="flex flex-col items-start gap-3">
      <BackCrumb path={['Hogar', 'Mercado']} onBack={() => undefined} />
      <BackCrumb path={['Hogar', 'Mercado']} isStrong onBack={() => undefined} />
    </div>
  ),
};

/** The chevron that goes into a row: the full height of the row. */
export const Drill: Story = {
  render: () => (
    <div className="flex h-10 w-64 items-stretch rounded-lg bg-card">
      <span className="flex flex-1 items-center px-3 text-sm">Hogar</span>
      <DrillButton name="Hogar" onDrill={() => undefined} />
    </div>
  ),
};
