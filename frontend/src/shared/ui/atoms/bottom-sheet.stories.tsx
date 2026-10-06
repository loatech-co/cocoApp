import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';

import { BottomSheet } from './bottom-sheet';
import { Button } from './button';
import { PanelRow } from './panel-row';

function Sheet({ isInitiallyOpen }: { isInitiallyOpen: boolean }) {
  const [isOpen, setIsOpen] = useState(isInitiallyOpen);
  return (
    <>
      <Button size="sm" onClick={() => setIsOpen(true)}>
        Abrir la hoja
      </Button>
      <BottomSheet isOpen={isOpen} title="Opciones" onClose={() => setIsOpen(false)}>
        {['Editar', 'Duplicar', 'Eliminar'].map((option) => (
          <PanelRow key={option} onClick={() => setIsOpen(false)}>
            {option}
          </PanelRow>
        ))}
      </BottomSheet>
    </>
  );
}

const meta = {
  title: 'Atoms/BottomSheet',
  component: BottomSheet,
  args: { isOpen: false, title: 'Opciones', onClose: () => undefined, children: null },
} satisfies Meta<typeof BottomSheet>;

export default meta;
type Story = StoryObj<typeof meta>;

/** The sheet that rises from the bottom on the phone. */
export const Closed: Story = { render: () => <Sheet isInitiallyOpen={false} /> };

export const Open: Story = { render: () => <Sheet isInitiallyOpen /> };
