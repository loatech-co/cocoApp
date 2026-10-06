import type { Meta, StoryObj } from '@storybook/react-vite';
import { Settings, User } from 'lucide-react';

import { LinkRow } from './link-row';

const meta = {
  title: 'Molecules/LinkRow',
  component: LinkRow,
  args: { Icon: User, to: '/perfil', children: 'Perfil' },
  decorators: [
    (Story) => (
      <div className="max-w-sm">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof LinkRow>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const List: Story = {
  render: () => (
    <div className="flex max-w-sm flex-col">
      <LinkRow Icon={User} to="/perfil">
        Perfil
      </LinkRow>
      <LinkRow Icon={Settings} to="/ajustes">
        Ajustes
      </LinkRow>
    </div>
  ),
};

export const FocusVisible: Story = { parameters: { pseudo: { focusVisible: ['a'] } } };
