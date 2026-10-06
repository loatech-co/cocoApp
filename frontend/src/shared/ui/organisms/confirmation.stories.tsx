import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';

import { Confirmation } from './confirmation';
import { Button } from '../atoms/button';

function Demo({ isDestructive, isBusy = false }: { isDestructive: boolean; isBusy?: boolean }) {
  const [isOpen, setIsOpen] = useState(true);
  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setIsOpen(true)}>
        Eliminar movimiento
      </Button>
      <Confirmation
        isOpen={isOpen}
        title="¿Eliminar este movimiento?"
        confirmLabel="Eliminar"
        isDestructive={isDestructive}
        isBusy={isBusy}
        onConfirm={() => setIsOpen(false)}
        onCancel={() => setIsOpen(false)}
      >
        Se borra el registro de este mes. El concepto sigue vivo para el mes siguiente.
      </Confirmation>
    </>
  );
}

const meta = {
  title: 'Organisms/Confirmation',
  component: Confirmation,
  args: {
    isOpen: false,
    title: '¿Seguro?',
    children: null,
    onConfirm: () => undefined,
    onCancel: () => undefined,
  },
} satisfies Meta<typeof Confirmation>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Asks before something that cannot be undone. */
export const Dangerous: Story = { render: () => <Demo isDestructive /> };

export const Neutral: Story = { render: () => <Demo isDestructive={false} /> };

export const Busy: Story = { render: () => <Demo isDestructive isBusy /> };
