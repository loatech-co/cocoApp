import type { Meta, StoryObj } from '@storybook/react-vite';
import { useEffect } from 'react';

import { showToast, clearToasts, ToastStack } from './toast';
import { Button } from '../atoms/button';

function Stack({ isPopulated }: { isPopulated: boolean }) {
  useEffect(() => {
    if (isPopulated) {
      showToast('Movimiento guardado', { tone: 'success' });
      showToast('Falta clasificar', { detail: 'Tres movimientos esperan.', tone: 'warning' });
      showToast('No se pudo guardar', { detail: 'Revisa la conexión.', tone: 'destructive' });
      showToast('Sesión iniciada', { tone: 'info' });
    }
    return clearToasts;
  }, [isPopulated]);

  return (
    <>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" onClick={() => showToast('Movimiento guardado', { tone: 'success' })}>
          Éxito
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() =>
            showToast('No se pudo guardar', {
              detail: 'Revisa la conexión.',
              tone: 'destructive',
            })
          }
        >
          Error
        </Button>
      </div>
      <ToastStack />
    </>
  );
}

const meta = {
  title: 'Molecules/Toast',
  component: ToastStack,
} satisfies Meta<typeof ToastStack>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Rule 14: each tone is told three ways — pill, glyph and glow. */
export const AllTones: Story = { render: () => <Stack isPopulated /> };

export const OnDemand: Story = { render: () => <Stack isPopulated={false} /> };
