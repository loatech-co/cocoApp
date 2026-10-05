import type { Meta, StoryObj } from '@storybook/react-vite';
import { Trash2 } from 'lucide-react';
import { useState } from 'react';

import { Modal } from './modal';
import { Button } from '../atoms/button';
import { Campo } from '../atoms/campo';
import { Input } from '../atoms/input';
import { PieDeModal } from '../molecules/modal-partes';

function Demo({ withActions = false, withHelp = true }) {
  const [open, setOpen] = useState(true);
  const close = () => setOpen(false);
  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        Abrir la ficha
      </Button>
      <Modal
        abierta={open}
        titulo="Nuevo centro de costos"
        {...(withHelp ? { ayuda: 'Agrupa los conceptos de una misma parte de la vida.' } : {})}
        {...(withActions
          ? {
              acciones: (
                <Button variant="ghost" size="sm-icon" aria-label="Eliminar">
                  <Trash2 />
                </Button>
              ),
            }
          : {})}
        onCerrar={close}
      >
        <Campo etiqueta="Nombre" id="modal-nombre">
          <Input id="modal-nombre" placeholder="Ej. Hogar" />
        </Campo>
        <PieDeModal>
          <Button variant="outline" onClick={close}>
            Cancelar
          </Button>
          <Button onClick={close}>Guardar</Button>
        </PieDeModal>
      </Modal>
    </>
  );
}

const meta = {
  title: 'Organisms/Modal',
  component: Modal,
  args: { abierta: false, titulo: 'Ficha', onCerrar: () => undefined, children: null },
} satisfies Meta<typeof Modal>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Rule 12: at most 720px, 16px padding, 400px minimum height. */
export const Default: Story = { render: () => <Demo /> };

export const WithActions: Story = { render: () => <Demo withActions /> };

export const TitleOnly: Story = { render: () => <Demo withHelp={false} /> };
