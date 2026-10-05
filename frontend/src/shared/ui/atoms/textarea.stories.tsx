import type { Meta, StoryObj } from '@storybook/react-vite';

import { Textarea } from './textarea';

const meta = {
  title: 'Atoms/Textarea',
  component: Textarea,
  args: { placeholder: 'Lo que haga falta recordar', 'aria-label': 'Nota' },
  decorators: [
    (Story) => (
      <div className="max-w-sm">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof Textarea>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Empty: Story = {};

export const Filled: Story = { args: { defaultValue: 'Pagado en efectivo.' } };

export const Disabled: Story = { args: { disabled: true } };

export const Invalid: Story = { args: { 'aria-invalid': true } };

export const FocusVisible: Story = { parameters: { pseudo: { focusVisible: true } } };
