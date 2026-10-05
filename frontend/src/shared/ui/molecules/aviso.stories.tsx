import type { Meta, StoryObj } from '@storybook/react-vite';
import { useEffect } from 'react';

import { mostrarAviso, olvidarAvisos, PilaDeAvisos } from './aviso';
import { Button } from '../atoms/button';

function Stack({ show }: { show: boolean }) {
  useEffect(() => {
    if (show) {
      mostrarAviso('Movimiento guardado', { tono: 'success' });
      mostrarAviso('Falta clasificar', { detalle: 'Tres movimientos esperan.', tono: 'warning' });
      mostrarAviso('No se pudo guardar', { detalle: 'Revisa la conexión.', tono: 'destructive' });
      mostrarAviso('Sesión iniciada', { tono: 'info' });
    }
    return olvidarAvisos;
  }, [show]);

  return (
    <>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" onClick={() => mostrarAviso('Movimiento guardado', { tono: 'success' })}>
          Éxito
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() =>
            mostrarAviso('No se pudo guardar', {
              detalle: 'Revisa la conexión.',
              tono: 'destructive',
            })
          }
        >
          Error
        </Button>
      </div>
      <PilaDeAvisos />
    </>
  );
}

const meta = {
  title: 'Molecules/Aviso',
  component: PilaDeAvisos,
} satisfies Meta<typeof PilaDeAvisos>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Rule 14: each tone is told three ways — pill, glyph and glow. */
export const AllTones: Story = { render: () => <Stack show /> };

export const OnDemand: Story = { render: () => <Stack show={false} /> };
