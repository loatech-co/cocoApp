import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';

import { Calendario } from './calendario';
import { Card } from '../atoms/card';

function OneDay() {
  const [day, setDay] = useState('2026-10-05');
  return <Calendario desde={day} hasta={day} onDia={setDay} />;
}

function Range() {
  const [range, setRange] = useState<{ from?: string; to?: string }>({
    from: '2026-10-05',
    to: '2026-10-16',
  });
  const choose = (iso: string) =>
    setRange(range.from && !range.to && iso >= range.from ? { ...range, to: iso } : { from: iso });
  return <Calendario desde={range.from} hasta={range.to} onDia={choose} />;
}

const meta = {
  title: 'Molecules/Calendario',
  component: Calendario,
  args: { onDia: () => undefined },
  decorators: [
    (Story) => (
      <Card className="inline-block p-3">
        <Story />
      </Card>
    ),
  ],
} satisfies Meta<typeof Calendario>;

export default meta;
type Story = StoryObj<typeof meta>;

/** One end paints a day. */
export const SingleDay: Story = { render: () => <OneDay /> };

/** Two ends paint a range. */
export const DateRange: Story = { render: () => <Range /> };

export const Empty: Story = { args: { vista: { anio: 2026, mes: 9 } } };

export const FocusVisible: Story = {
  parameters: { pseudo: { focusVisible: ['button'] } },
  render: () => <OneDay />,
};
