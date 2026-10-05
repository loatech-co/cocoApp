import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';

import { Tabla, TablaEsqueleto, TablaPie, Td, Th, Tr } from './tabla';
import { Monto } from '../atoms/monto';

/** Made-up rows: the catalogue never shows real data. */
const ROWS = [
  { id: 1, name: 'Mercado', centre: 'Hogar', amount: '85000', type: 'expense' as const },
  { id: 2, name: 'Arriendo', centre: 'Costos fijos', amount: '900000', type: 'expense' as const },
  { id: 3, name: 'Salario', centre: 'Ingresos', amount: '3000000', type: 'income' as const },
];

function Demo() {
  const [order, setOrder] = useState<'asc' | 'desc'>('asc');
  return (
    <Tabla>
      <thead>
        <tr>
          <Th
            fija
            orden={{ activo: order, onCambiar: () => setOrder(order === 'asc' ? 'desc' : 'asc') }}
          >
            Concepto
          </Th>
          <Th>Centro de costos</Th>
          <Th alineado="derecha">Valor</Th>
        </tr>
      </thead>
      <tbody>
        {ROWS.map((row, i) => (
          <Tr key={row.id} onClick={() => undefined} atencion={i === 0} atenuada={i === 2}>
            <Td fija>{row.name}</Td>
            <Td>{row.centre}</Td>
            <Td alineado="derecha">
              <Monto amount={row.amount} type={row.type} />
            </Td>
          </Tr>
        ))}
      </tbody>
    </Tabla>
  );
}

const meta = {
  title: 'Molecules/Tabla',
  component: Tabla,
  args: { children: null },
} satisfies Meta<typeof Tabla>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Sortable header, clickable rows; the first needs attention, the last is dimmed. */
export const Default: Story = { render: () => <Demo /> };

export const WithFooter: Story = {
  render: () => (
    <div className="flex flex-col gap-2">
      <Demo />
      <TablaPie>3 movimientos</TablaPie>
    </div>
  ),
};

export const Loading: Story = {
  render: () => <TablaEsqueleto columnas={['Concepto', 'Centro de costos', 'Valor']} filas={5} />,
};
