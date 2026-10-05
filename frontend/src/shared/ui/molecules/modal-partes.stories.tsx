import type { Meta, StoryObj } from '@storybook/react-vite';
import { Pencil, ShoppingCart, Trash2 } from 'lucide-react';

import { CabeceraDeModal, PANEL_DE_MODAL, PieDeModal } from './modal-partes';
import { Button } from '../atoms/button';
import { ChipIcono } from '../atoms/chip-icono';

const meta = {
  title: 'Molecules/ModalPartes',
  component: CabeceraDeModal,
  args: { titulo: 'Nuevo centro de costos', onCerrar: () => undefined },
  decorators: [
    (Story) => (
      <div className={PANEL_DE_MODAL}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof CabeceraDeModal>;

export default meta;
type Story = StoryObj<typeof meta>;

export const HeaderTitleOnly: Story = {};

export const HeaderWithHelp: Story = {
  args: { ayuda: 'Agrupa los conceptos de una misma parte de la vida.' },
};

/** Rule 11: the × goes next to the other whole-sheet actions. */
export const HeaderWithActions: Story = {
  args: {
    titulo: 'Mercado',
    ayuda: 'Hogar · octubre',
    antes: <ChipIcono Icono={ShoppingCart} color="gasto" tamano="sm" />,
    acciones: (
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
    <PieDeModal>
      <Button variant="outline">Cancelar</Button>
      <Button>Registrar</Button>
    </PieDeModal>
  ),
};
