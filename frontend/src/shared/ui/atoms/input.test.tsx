// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { Search } from 'lucide-react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { Input } from './input';

afterEach(cleanup);

describe('Input', () => {
  it('is a text box that takes its name from the caller and reports what is typed', () => {
    const onChange = vi.fn();
    render(<Input aria-label="Nombre" onChange={onChange} />);

    const box = screen.getByRole('textbox', { name: 'Nombre' });
    fireEvent.change(box, { target: { value: 'Aseo' } });

    expect(onChange).toHaveBeenCalledOnce();
    expect((box as HTMLInputElement).value).toBe('Aseo');
  });

  it('keeps the placeholder it is given as an example', () => {
    render(<Input aria-label="Fecha" placeholder="dd/mm/aaaa" />);

    expect(screen.getByPlaceholderText('dd/mm/aaaa')).toBeTruthy();
  });

  it('passes the disabled and invalid states to the native control', () => {
    render(<Input aria-label="Correo" disabled aria-invalid />);

    const box = screen.getByRole<HTMLInputElement>('textbox', { name: 'Correo' });
    expect(box.disabled).toBe(true);
    expect(box.getAttribute('aria-invalid')).toBe('true');
  });

  it('paints focus only when the keyboard asks for it', () => {
    render(<Input aria-label="Nombre" />);

    const classes = screen.getByRole('textbox').className.split(/\s+/);
    expect(classes.some((c) => c.startsWith('focus-visible:'))).toBe(true);
    expect(classes.some((c) => /^focus:(?!placeholder)/.test(c))).toBe(false);
  });

  it('hides its informative icon from assistive tech', () => {
    const { container } = render(<Input aria-label="Buscar" icon={Search} />);

    expect(container.querySelector('[data-icono] svg')?.getAttribute('aria-hidden')).toBe('true');
  });

  it('keeps its actions reachable as buttons', () => {
    const onClear = vi.fn();
    render(
      <Input
        aria-label="Buscar"
        actions={[
          <button key="borrar" type="button" onClick={onClear}>
            Borrar
          </button>,
        ]}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Borrar' }));

    expect(onClear).toHaveBeenCalledOnce();
  });

  it('measures 36 or 44 pixels like every other control', () => {
    const { rerender } = render(<Input aria-label="Nombre" size="sm" />);
    expect(screen.getByRole('textbox').className).toContain('h-9');

    rerender(<Input aria-label="Nombre" />);
    expect(screen.getByRole('textbox').className).toContain('h-11');
  });
});
