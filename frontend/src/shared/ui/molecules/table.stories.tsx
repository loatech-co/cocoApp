import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';

import { Table, TableSkeleton, TableFooter, Td, Th, Tr } from './table';
import { Amount } from '../atoms/amount';

/** Made-up rows: the catalog never shows real data. */
const ROWS = [
  { id: 1, name: 'Mercado', center: 'Hogar', amount: '85000', direction: 'out' as const },
  { id: 2, name: 'Arriendo', center: 'Costos fijos', amount: '900000', direction: 'out' as const },
  { id: 3, name: 'Salario', center: 'Ingresos', amount: '3000000', direction: 'in' as const },
];

function Demo() {
  const [order, setOrder] = useState<'asc' | 'desc'>('asc');
  return (
    <Table>
      <thead>
        <tr>
          <Th
            isSticky
            sort={{ direction: order, onChange: () => setOrder(order === 'asc' ? 'desc' : 'asc') }}
          >
            Concepto
          </Th>
          <Th>Centro de costos</Th>
          <Th align="right">Valor</Th>
        </tr>
      </thead>
      <tbody>
        {ROWS.map((row, i) => (
          <Tr key={row.id} onClick={() => undefined} isFlagged={i === 0} isDimmed={i === 2}>
            <Td isSticky>{row.name}</Td>
            <Td>{row.center}</Td>
            <Td align="right">
              <Amount amount={row.amount} direction={row.direction} />
            </Td>
          </Tr>
        ))}
      </tbody>
    </Table>
  );
}

const meta = {
  title: 'Molecules/Table',
  component: Table,
  args: { children: null },
} satisfies Meta<typeof Table>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Sortable header, clickable rows; the first needs attention, the last is dimmed. */
export const Default: Story = { render: () => <Demo /> };

export const WithFooter: Story = {
  render: () => (
    <div className="flex flex-col gap-2">
      <Demo />
      <TableFooter>3 movimientos</TableFooter>
    </div>
  ),
};

export const Loading: Story = {
  render: () => <TableSkeleton columns={['Concepto', 'Centro de costos', 'Valor']} rows={5} />,
};
