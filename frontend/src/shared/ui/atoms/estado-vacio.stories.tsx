import type { Meta, StoryObj } from '@storybook/react-vite';
import { Inbox, Plus } from 'lucide-react';

import { Button } from './button';
import { EstadoVacio } from './estado-vacio';

const meta = {
  title: 'Atoms/EstadoVacio',
  component: EstadoVacio,
  args: { Icono: Inbox, titulo: 'Aún no hay movimientos' },
} satisfies Meta<typeof EstadoVacio>;

export default meta;
type Story = StoryObj<typeof meta>;

export const TitleOnly: Story = {};

export const WithHelp: Story = {
  args: { ayuda: 'Registra el primero o importa un extracto.' },
};

export const WithAction: Story = {
  args: {
    ayuda: 'Registra el primero o importa un extracto.',
    accion: (
      <Button size="sm">
        <Plus />
        Registrar
      </Button>
    ),
  },
};
