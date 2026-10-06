import type { Meta, StoryObj } from '@storybook/react-vite';
import { Pencil, ShoppingCart, Trash2 } from 'lucide-react';

import { ModalHeader, ModalBody, MODAL_PANEL, ModalFooter } from './modal-parts';
import { Button } from '../atoms/button';
import { IconChip } from '../atoms/icon-chip';

const meta = {
  title: 'Molecules/ModalParts',
  component: ModalHeader,
  args: { title: 'Nuevo centro de costos', onClose: () => undefined },
  decorators: [
    (Story) => (
      <div className={MODAL_PANEL}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof ModalHeader>;

export default meta;
type Story = StoryObj<typeof meta>;

export const HeaderTitleOnly: Story = {};

export const HeaderWithHelp: Story = {
  args: { description: 'Agrupa los conceptos de una misma parte de la vida.' },
};

/** Rule 11: the × goes next to the other whole-sheet actions. */
export const HeaderWithActions: Story = {
  args: {
    title: 'Mercado',
    description: 'Hogar · octubre',
    leading: <IconChip Icon={ShoppingCart} color="expense" size="sm" />,
    actions: (
      <>
        <Button variant="ghost" size="sm-icon" aria-label="Editar">
          <Pencil />
        </Button>
        <Button variant="ghost" size="sm-icon" aria-label="Eliminar">
          <Trash2 />
        </Button>
      </>
    ),
  },
};

/** Buttons at the size of their text, on the right; stacked on the phone. */
export const Footer: Story = {
  render: () => (
    <ModalFooter>
      <Button variant="outline">Cancelar</Button>
      <Button>Registrar</Button>
    </ModalFooter>
  ),
};

/** Header, scrolling body and footer, inside the 720px panel. */
export const WithBody: Story = {
  render: () => (
    <div className={`${MODAL_PANEL} rounded-lg bg-popover`}>
      <ModalHeader title="Nuevo concepto" onClose={() => undefined} />
      <ModalBody>
        <p className="text-sm text-muted-foreground">El formulario va aquí.</p>
        <ModalFooter>
          <Button variant="outline">Cancelar</Button>
          <Button>Guardar</Button>
        </ModalFooter>
      </ModalBody>
    </div>
  ),
};
