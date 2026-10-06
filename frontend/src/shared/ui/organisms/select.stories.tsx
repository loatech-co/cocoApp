import type { Meta, StoryObj } from '@storybook/react-vite';
import { Landmark } from 'lucide-react';
import { useState } from 'react';

import { Select } from './select';
import { Field } from '../atoms/field';

const OPTIONS = [
  { value: 'hogar', label: 'Hogar' },
  { value: 'costos-fijos', label: 'Costos fijos' },
  { value: 'transporte', label: 'Transporte' },
];

function Controlled(props: { start?: string; size?: 'sm' | 'md'; disabled?: boolean }) {
  const [value, setValue] = useState(props.start ?? '');
  return (
    <Field label="Centro de costos" id="select-centro" className="max-w-sm">
      <Select
        id="select-centro"
        label="Centro de costos"
        value={value}
        onChange={setValue}
        options={OPTIONS}
        emptyLabel="Sin centro"
        size={props.size ?? 'md'}
        disabled={props.disabled}
      />
    </Field>
  );
}

const meta = {
  title: 'Organisms/Select',
  component: Select,
  args: { value: '', onChange: () => undefined, options: OPTIONS, label: 'Centro' },
  decorators: [
    (Story) => (
      <div className="min-h-64">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof Select>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Rule 1: replaces the native `<select>`. */
export const Empty: Story = { render: () => <Controlled /> };

export const Chosen: Story = { render: () => <Controlled start="hogar" /> };

export const Small: Story = { render: () => <Controlled start="hogar" size="sm" /> };

export const Disabled: Story = { render: () => <Controlled start="hogar" disabled /> };

export const WithIcon: Story = {
  args: { icon: Landmark, value: 'hogar', className: 'max-w-sm' },
};

export const FocusVisible: Story = {
  parameters: { pseudo: { focusVisible: ['button'], focusWithin: ['.campo'] } },
  render: () => <Controlled start="hogar" />,
};
