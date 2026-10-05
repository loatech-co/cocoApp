import type { Meta, StoryObj } from '@storybook/react-vite';

import { ToggleOption } from './toggle-option';

/** An option of a short list that switches on: the range presets. */
const meta: Meta = { title: 'Atoms/ToggleOption' };

export default meta;
type Story = StoryObj;

/** On carries the accent; off answers the pointer (rule 8, exception). */
export const States: Story = {
  render: () => (
    <ul className="flex w-44 flex-col gap-1">
      <li>
        <ToggleOption encendida onClick={() => undefined}>
          Este mes
        </ToggleOption>
      </li>
      <li>
        <ToggleOption encendida={false} onClick={() => undefined}>
          Últimos 90 días
        </ToggleOption>
      </li>
    </ul>
  ),
};
