import type { Meta, StoryObj } from '@storybook/react-vite';
import { ArrowDownLeft, ArrowUpRight, ListChecks, PiggyBank } from 'lucide-react';

import { IconChip } from './icon-chip';

const meta = {
  title: 'Atoms/IconChip',
  component: IconChip,
  args: { Icon: ArrowUpRight, color: 'expense', size: 'default' },
  argTypes: {
    color: { control: 'select', options: ['expense', 'income', 'budget', 'transactions'] },
    size: { control: 'inline-radio', options: ['sm', 'default'] },
  },
} satisfies Meta<typeof IconChip>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {};

/** Rule 5: the colors are named by their role, not by the hue they have today. */
export const Roles: Story = {
  render: () => (
    <div className="flex flex-col gap-4">
      {(['default', 'sm'] as const).map((size) => (
        <div key={size} className="flex gap-3">
          <IconChip Icon={ArrowUpRight} color="expense" size={size} />
          <IconChip Icon={ArrowDownLeft} color="income" size={size} />
          <IconChip Icon={PiggyBank} color="budget" size={size} />
          <IconChip Icon={ListChecks} color="transactions" size={size} />
        </div>
      ))}
    </div>
  ),
};
