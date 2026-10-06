import type { Meta, StoryObj } from '@storybook/react-vite';
import { Trash2 } from 'lucide-react';
import { useState } from 'react';

import { Modal } from './modal';
import { Button } from '../atoms/button';
import { Field } from '../atoms/field';
import { Input } from '../atoms/input';
import { ModalFooter } from '../molecules/modal-parts';

function Demo({ hasActions = false, hasDescription = true }) {
  const [isOpen, setIsOpen] = useState(true);
  const close = () => setIsOpen(false);
  return (
    <>
      <Button size="sm" onClick={() => setIsOpen(true)}>
        Abrir la ficha
      </Button>
      <Modal
        isOpen={isOpen}
        title="Nuevo centro de costos"
        {...(hasDescription
          ? { description: 'Agrupa los conceptos de una misma parte de la vida.' }
          : {})}
        {...(hasActions
          ? {
              actions: (
                <Button variant="ghost" size="sm-icon" aria-label="Eliminar">
                  <Trash2 />
                </Button>
              ),
            }
          : {})}
        onClose={close}
      >
        <Field label="Nombre" id="modal-nombre">
          <Input id="modal-nombre" placeholder="Ej. Hogar" />
        </Field>
        <ModalFooter>
          <Button variant="outline" onClick={close}>
            Cancelar
          </Button>
          <Button onClick={close}>Guardar</Button>
        </ModalFooter>
      </Modal>
    </>
  );
}

const meta = {
  title: 'Organisms/Modal',
  component: Modal,
  args: { isOpen: false, title: 'Ficha', onClose: () => undefined, children: null },
} satisfies Meta<typeof Modal>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Rule 12: at most 720px, 16px padding, 400px minimum height. */
export const Default: Story = { render: () => <Demo /> };

export const WithActions: Story = { render: () => <Demo hasActions /> };

export const TitleOnly: Story = { render: () => <Demo hasDescription={false} /> };
