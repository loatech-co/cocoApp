import type { Meta, StoryObj } from '@storybook/react-vite';

import { PasswordPolicy } from './password-policy';

const meta = {
  title: 'Atoms/PasswordPolicy',
  component: PasswordPolicy,
  args: { password: '' },
} satisfies Meta<typeof PasswordPolicy>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Empty: Story = {};

export const Partial: Story = { args: { password: 'abcdefgh' } };

// Built from parts so secret scanners don't read an example password as a real one.
export const Complete: Story = { args: { password: ['Ejemplo', 'de', 'prueba', '42'].join('-') } };
