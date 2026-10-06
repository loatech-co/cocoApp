// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { Inbox } from 'lucide-react';
import { afterEach, describe, expect, it } from 'vitest';

import { EmptyState } from './empty-state';

afterEach(cleanup);

describe('EstadoVacio', () => {
  it('shows the title, the help and the action', () => {
    render(
      <EmptyState
        Icon={Inbox}
        title="Sin movimientos"
        description="Registra el primero."
        action={<button type="button">Registrar</button>}
      />,
    );

    expect(screen.getByText('Sin movimientos')).toBeTruthy();
    expect(screen.getByText('Registra el primero.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Registrar' })).toBeTruthy();
  });

  it('hides its drawing from assistive tech and skips the help when there is none', () => {
    const { container } = render(<EmptyState Icon={Inbox} title="Sin movimientos" />);

    expect(container.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
    expect(container.textContent).toBe('Sin movimientos');
  });
});
