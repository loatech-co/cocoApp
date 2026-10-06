// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { MoneyField } from './money-field';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

/** A field with its own state, the way a form uses it. */
function Controlled({ onValueChange }: { onValueChange: (raw: string) => void }) {
  const [value, setValue] = useState('');
  return (
    <MoneyField
      aria-label="Valor"
      value={value}
      onValueChange={(raw) => {
        setValue(raw);
        onValueChange(raw);
      }}
    />
  );
}

describe('MoneyField', () => {
  it('opens the decimal keyboard on a phone', () => {
    render(<MoneyField aria-label="Valor" value="" onValueChange={vi.fn()} />);

    expect(screen.getByRole('textbox', { name: 'Valor' }).getAttribute('inputmode')).toBe(
      'decimal',
    );
  });

  it('shows the thousands grouped', () => {
    render(<MoneyField aria-label="Valor" value="1234567" onValueChange={vi.fn()} />);

    expect(screen.getByRole<HTMLInputElement>('textbox').value).toBe('1.234.567');
  });

  it('hands back only digits and the decimal comma, whatever is typed', () => {
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
      cb(0);
      return 0;
    });
    const onValueChange = vi.fn();
    render(<Controlled onValueChange={onValueChange} />);

    const box = screen.getByRole<HTMLInputElement>('textbox');
    fireEvent.change(box, { target: { value: '$12a.345,5' } });

    expect(onValueChange).toHaveBeenCalledWith('12345,5');
    expect(box.value).toBe('12.345,5');
  });

  it('keeps the caret after the digit just typed when the grouping moves it', () => {
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
      cb(0);
      return 0;
    });
    render(<Controlled onValueChange={vi.fn()} />);

    const box = screen.getByRole<HTMLInputElement>('textbox');
    const setRange = vi.spyOn(box, 'setSelectionRange');
    fireEvent.change(box, { target: { value: '1234', selectionStart: 4 } });

    // «1.234»: four digits before the caret, so it lands after the last one.
    expect(setRange).toHaveBeenLastCalledWith(5, 5);
  });

  it('draws the currency sign as decoration', () => {
    const { container } = render(
      <MoneyField aria-label="Valor" value="" onValueChange={vi.fn()} />,
    );

    const sign = container.querySelector('[data-icono] [aria-hidden="true"]');
    expect(sign?.textContent).toBe('$');
  });
});
