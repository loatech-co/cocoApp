import type { Meta, StoryObj } from '@storybook/react-vite';

import { Switch } from './switch';

const meta = {
  title: 'Atoms/Switch',
  component: Switch,
  args: { 'aria-label': 'Centro estático' },
} satisfies Meta<typeof Switch>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Off: Story = {};

export const On: Story = { args: { defaultChecked: true } };

export const Disabled: Story = {
  render: (args) => (
    <div className="flex gap-4">
      <Switch {...args} disabled />
      <Switch {...args} disabled defaultChecked />
    </div>
  ),
};

export const FocusVisible: Story = {
  args: { defaultChecked: true },
  parameters: { pseudo: { focusVisible: ['input'] } },
};

/** Saving on change: the knob spins and the switch cannot be pressed again. */
export const Loading: Story = { args: { defaultChecked: true, isLoading: true } };
