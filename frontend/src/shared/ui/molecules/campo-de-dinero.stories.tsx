import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';

import { CampoDeDinero } from './campo-de-dinero';
import { Campo } from '../atoms/campo';

function Controlled({ start, invalid = false }: { start: string; invalid?: boolean }) {
  const [value, setValue] = useState(start);
  return (
    <Campo etiqueta="Valor" id="campo-valor" className="max-w-sm">
      <CampoDeDinero id="campo-valor" valor={value} onCambiar={setValue} aria-invalid={invalid} />
    </Campo>
  );
}

const meta = {
  title: 'Molecules/CampoDeDinero',
  component: CampoDeDinero,
  args: { valor: '', onCambiar: () => undefined },
} satisfies Meta<typeof CampoDeDinero>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Empty: Story = { render: () => <Controlled start="" /> };

/** Only digits travel to the API; the thousands separator is drawn. */
export const Filled: Story = { render: () => <Controlled start="1250000" /> };

export const Invalid: Story = { render: () => <Controlled start="0" invalid /> };

export const Disabled: Story = {
  args: { valor: '1250000', disabled: true, 'aria-label': 'Valor' },
};

export const FocusVisible: Story = {
  parameters: { pseudo: { focusVisible: true, focusWithin: true } },
  render: () => <Controlled start="1250000" />,
};
