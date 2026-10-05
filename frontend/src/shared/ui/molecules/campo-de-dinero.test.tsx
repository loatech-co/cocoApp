// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { CampoDeDinero } from './campo-de-dinero';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

/** A field with its own state, the way a form uses it. */
function Controlled({ onCambiar }: { onCambiar: (raw: string) => void }) {
  const [value, setValue] = useState('');
  return (
    <CampoDeDinero
      aria-label="Valor"
      valor={value}
      onCambiar={(raw) => {
        setValue(raw);
        onCambiar(raw);
      }}
    />
  );
}

describe('CampoDeDinero', () => {
  it('opens the decimal keyboard on a phone', () => {
    render(<CampoDeDinero aria-label="Valor" valor="" onCambiar={vi.fn()} />);

    expect(screen.getByRole('textbox', { name: 'Valor' }).getAttribute('inputmode')).toBe(
      'decimal',
    );
  });

  it('shows the thousands grouped', () => {
    render(<CampoDeDinero aria-label="Valor" valor="1234567" onCambiar={vi.fn()} />);

    expect(screen.getByRole<HTMLInputElement>('textbox').value).toBe('1.234.567');
  });

  it('hands back only digits and the decimal comma, whatever is typed', () => {
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
      cb(0);
      return 0;
    });
    const onCambiar = vi.fn();
    render(<Controlled onCambiar={onCambiar} />);

    const box = screen.getByRole<HTMLInputElement>('textbox');
    fireEvent.change(box, { target: { value: '$12a.345,5' } });

    expect(onCambiar).toHaveBeenCalledWith('12345,5');
    expect(box.value).toBe('12.345,5');
  });

  it('keeps the caret after the digit just typed when the grouping moves it', () => {
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
      cb(0);
      return 0;
    });
    render(<Controlled onCambiar={vi.fn()} />);

    const box = screen.getByRole<HTMLInputElement>('textbox');
    const setRange = vi.spyOn(box, 'setSelectionRange');
    fireEvent.change(box, { target: { value: '1234', selectionStart: 4 } });

    // «1.234»: four digits before the caret, so it lands after the last one.
    expect(setRange).toHaveBeenLastCalledWith(5, 5);
  });

  it('draws the currency sign as decoration', () => {
    const { container } = render(<CampoDeDinero aria-label="Valor" valor="" onCambiar={vi.fn()} />);

    const sign = container.querySelector('[data-icono] [aria-hidden="true"]');
    expect(sign?.textContent).toBe('$');
  });
});
