// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { Alert, AlertDescription, AlertTitle, ErrorAlert } from './alert';

afterEach(cleanup);

describe('Alert', () => {
  it('interrupts the screen reader only for an error', () => {
    render(
      <Alert variant="destructive">
        <AlertTitle>No se pudo guardar</AlertTitle>
        <AlertDescription>Inténtalo otra vez.</AlertDescription>
      </Alert>,
    );

    const alert = screen.getByRole('alert');
    expect(alert.textContent).toContain('No se pudo guardar');
    expect(alert.textContent).toContain('Inténtalo otra vez.');
  });

  it.each(['default', 'warning', 'success', 'info'] as const)(
    'is a polite status in the %s tone',
    (variant) => {
      render(<Alert variant={variant}>Aviso</Alert>);

      expect(screen.getByRole('status').textContent).toBe('Aviso');
      expect(screen.queryByRole('alert')).toBeNull();
    },
  );

  it('draws a hidden icon for every tone except the neutral one', () => {
    const { container, rerender } = render(<Alert>Neutro</Alert>);
    expect(container.querySelector('svg')).toBeNull();

    for (const variant of ['destructive', 'warning', 'success', 'info'] as const) {
      rerender(<Alert variant={variant}>Con tono</Alert>);
      expect(container.querySelector('svg')?.getAttribute('aria-hidden'), variant).toBe('true');
    }
  });

  it('keeps red for errors: the pending tone uses the warning color', () => {
    render(<Alert variant="warning">Pendiente</Alert>);

    const status = screen.getByRole('status');
    expect(status.className).toContain('text-warning');
    expect(status.className).not.toContain('destructive');
  });
});

describe('ErrorAlert', () => {
  it('says what failed and lists what explains it', () => {
    render(
      <ErrorAlert
        message="La contraseña no cumple."
        details={['Doce caracteres.', 'Un número.']}
      />,
    );

    const alert = screen.getByRole('alert');
    expect(alert.textContent).toContain('La contraseña no cumple.');
    expect(Array.from(alert.querySelectorAll('li'), (li) => li.textContent)).toEqual([
      'Doce caracteres.',
      'Un número.',
    ]);
  });

  it('is a plain error without details', () => {
    render(<ErrorAlert message="Algo falló." />);

    expect(screen.getByRole('alert').querySelector('ul')).toBeNull();
  });
});
