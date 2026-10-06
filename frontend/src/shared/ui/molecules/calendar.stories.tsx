import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';

import { Calendar } from './calendar';
import { Card } from '../atoms/card';

function OneDay() {
  const [day, setDay] = useState('2026-10-05');
  return <Calendar from={day} to={day} onSelectDay={setDay} />;
}

function Range() {
  const [range, setRange] = useState<{ from?: string; to?: string }>({
    from: '2026-10-05',
    to: '2026-10-16',
  });
  const choose = (iso: string) =>
    setRange(range.from && !range.to && iso >= range.from ? { ...range, to: iso } : { from: iso });
  return <Calendar from={range.from} to={range.to} onSelectDay={choose} />;
}

const meta = {
  title: 'Molecules/Calendar',
  component: Calendar,
  args: { onSelectDay: () => undefined },
  decorators: [
    (Story) => (
      <Card className="inline-block p-3">
        <Story />
      </Card>
    ),
  ],
} satisfies Meta<typeof Calendar>;

export default meta;
type Story = StoryObj<typeof meta>;

/** One end paints a day. */
export const SingleDay: Story = { render: () => <OneDay /> };

/** Two ends paint a range. */
export const DateRange: Story = { render: () => <Range /> };

export const Empty: Story = { args: { view: { year: 2026, month: 9 } } };

export const FocusVisible: Story = {
  parameters: { pseudo: { focusVisible: ['button'] } },
  render: () => <OneDay />,
};
