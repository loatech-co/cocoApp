import type { Meta, StoryObj } from '@storybook/react-vite';

import { Checkbox } from './checkbox';

const meta = {
  title: 'Atoms/Checkbox',
  component: Checkbox,
  args: { 'aria-label': 'Elegir' },
} satisfies Meta<typeof Checkbox>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Unchecked: Story = {};

export const Checked: Story = { args: { defaultChecked: true } };

/** A parent with only some children checked. */
export const Indeterminate: Story = { args: { isIndeterminate: true } };

export const Disabled: Story = {
  render: (args) => (
    <div className="flex gap-4">
      <Checkbox {...args} disabled />
      <Checkbox {...args} disabled defaultChecked />
    </div>
  ),
};

export const FocusVisible: Story = {
  args: { defaultChecked: true },
  parameters: { pseudo: { focusVisible: ['input'] } },
};
