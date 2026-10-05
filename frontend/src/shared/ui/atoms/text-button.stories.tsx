import type { Meta, StoryObj } from '@storybook/react-vite';

import { TextButton } from './text-button';

/** An action that reads as text, inside a line. */
const meta: Meta = { title: 'Atoms/TextButton' };

export default meta;
type Story = StoryObj;

/** The three tones: counter action, alternative under a field, exit inside a dropdown. */
export const Tones: Story = {
  render: () => (
    <div className="flex flex-col items-start gap-3 text-sm">
      <span>
        3 marcados ·{' '}
        <TextButton tono="primario" onClick={() => undefined}>
          Limpiar
        </TextButton>
      </span>
      <TextButton tono="tenue" onClick={() => undefined}>
        Elegir por centro y categoría
      </TextButton>
      <span className="text-xs text-muted-foreground">
        <TextButton tono="realce" onClick={() => undefined}>
          Volver
        </TextButton>
      </span>
    </div>
  ),
};
