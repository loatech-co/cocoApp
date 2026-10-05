import type { Meta, StoryObj } from '@storybook/react-vite';
import { Settings, User } from 'lucide-react';

import { FilaDeEnlace } from './link-row';

const meta = {
  title: 'Molecules/FilaDeEnlace',
  component: FilaDeEnlace,
  args: { Icono: User, a: '/perfil', children: 'Perfil' },
  decorators: [
    (Story) => (
      <div className="max-w-sm">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof FilaDeEnlace>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const List: Story = {
  render: () => (
    <div className="flex max-w-sm flex-col">
      <FilaDeEnlace Icono={User} a="/perfil">
        Perfil
      </FilaDeEnlace>
      <FilaDeEnlace Icono={Settings} a="/ajustes">
        Ajustes
      </FilaDeEnlace>
    </div>
  ),
};

export const FocusVisible: Story = { parameters: { pseudo: { focusVisible: ['a'] } } };
