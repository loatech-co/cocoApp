import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';

import { Confirmacion } from './confirmacion';
import { Button } from '../atoms/button';

function Demo({ dangerous, busy = false }: { dangerous: boolean; busy?: boolean }) {
  const [open, setOpen] = useState(true);
  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        Eliminar movimiento
      </Button>
      <Confirmacion
        abierta={open}
        titulo="¿Eliminar este movimiento?"
        etiquetaConfirmar="Eliminar"
        peligrosa={dangerous}
        ocupada={busy}
        onConfirmar={() => setOpen(false)}
        onCancelar={() => setOpen(false)}
      >
        Se borra el registro de este mes. El concepto sigue vivo para el mes siguiente.
      </Confirmacion>
    </>
  );
}

const meta = {
  title: 'Organisms/Confirmacion',
  component: Confirmacion,
  args: {
    abierta: false,
    titulo: '¿Seguro?',
    children: null,
    onConfirmar: () => undefined,
    onCancelar: () => undefined,
  },
} satisfies Meta<typeof Confirmacion>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Asks before something that cannot be undone. */
export const Dangerous: Story = { render: () => <Demo dangerous /> };

export const Neutral: Story = { render: () => <Demo dangerous={false} /> };

export const Busy: Story = { render: () => <Demo dangerous busy /> };
