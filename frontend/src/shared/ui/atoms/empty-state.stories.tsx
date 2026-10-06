import type { Meta, StoryObj } from '@storybook/react-vite';
import { Inbox, Plus } from 'lucide-react';

import { Button } from './button';
import { EmptyState } from './empty-state';

const meta = {
  title: 'Atoms/EmptyState',
  component: EmptyState,
  args: { Icon: Inbox, title: 'Aún no hay movimientos' },
} satisfies Meta<typeof EmptyState>;

export default meta;
type Story = StoryObj<typeof meta>;

export const TitleOnly: Story = {};

export const WithHelp: Story = {
  args: { description: 'Registra el primero o importa un extracto.' },
};

export const WithAction: Story = {
  args: {
    description: 'Registra el primero o importa un extracto.',
    action: (
      <Button size="sm">
        <Plus />
        Registrar
      </Button>
    ),
  },
};
