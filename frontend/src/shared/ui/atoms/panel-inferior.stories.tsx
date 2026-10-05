import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';

import { Button } from './button';
import { FILA_DE_PANEL, PanelInferior } from './panel-inferior';

function Sheet({ startOpen }: { startOpen: boolean }) {
  const [open, setOpen] = useState(startOpen);
  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        Abrir la hoja
      </Button>
      <PanelInferior abierto={open} titulo="Opciones" onCerrar={() => setOpen(false)}>
        {['Editar', 'Duplicar', 'Eliminar'].map((option) => (
          <button
            key={option}
            type="button"
            className={FILA_DE_PANEL}
            onClick={() => setOpen(false)}
          >
            {option}
          </button>
        ))}
      </PanelInferior>
    </>
  );
}

const meta = {
  title: 'Atoms/PanelInferior',
  component: PanelInferior,
  args: { abierto: false, titulo: 'Opciones', onCerrar: () => undefined, children: null },
} satisfies Meta<typeof PanelInferior>;

export default meta;
type Story = StoryObj<typeof meta>;

/** The sheet that rises from the bottom on the phone. */
export const Closed: Story = { render: () => <Sheet startOpen={false} /> };

export const Open: Story = { render: () => <Sheet startOpen /> };
