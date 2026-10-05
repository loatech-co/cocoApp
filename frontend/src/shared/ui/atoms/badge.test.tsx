// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { Badge, Chip, Etiqueta } from './badge';

afterEach(cleanup);

describe('Etiqueta', () => {
  it('paints each role with its own colour', () => {
    render(
      <>
        <Etiqueta tono="ingreso">Ingreso</Etiqueta>
        <Etiqueta tono="pendiente">Pendiente</Etiqueta>
        <Etiqueta tono="error">Error</Etiqueta>
      </>,
    );

    expect(screen.getByText('Ingreso').className).toContain('text-income');
    expect(screen.getByText('Pendiente').className).toContain('text-warning');
    expect(screen.getByText('Error').className).toContain('text-destructive');
  });
});

describe('Badge', () => {
  it.each([
    ['default', 'bg-muted'],
    ['outline', 'border-border'],
    ['income', 'text-income'],
    ['expense', 'text-expense'],
    ['warning', 'text-warning'],
    ['info', 'text-info'],
  ] as const)('maps the %s variant onto the matching tone', (variant, clase) => {
    render(<Badge variant={variant}>Rótulo</Badge>);

    expect(screen.getByText('Rótulo').className).toContain(clase);
  });

  it('falls back to the neutral tone', () => {
    render(<Badge>Rótulo</Badge>);

    expect(screen.getByText('Rótulo').className).toContain('bg-muted');
  });
});

describe('Chip', () => {
  it('is a toggle button that reports whether it is on', () => {
    const onClick = vi.fn();
    render(
      <Chip activo onClick={onClick}>
        Pagados
      </Chip>,
    );

    const chip = screen.getByRole('button', { name: 'Pagados' });
    expect(chip.getAttribute('aria-pressed')).toBe('true');

    fireEvent.click(chip);

    expect(onClick).toHaveBeenCalledOnce();
  });

  it('is not pressed by default', () => {
    render(<Chip>Pagados</Chip>);

    expect(screen.getByRole('button', { name: 'Pagados' }).getAttribute('aria-pressed')).toBe(
      'false',
    );
  });

  it('shows its name as plain text when it can only be removed', () => {
    const onQuitar = vi.fn();
    render(<Chip onQuitar={onQuitar}>mercado</Chip>);

    expect(screen.queryByRole('button', { name: 'mercado' })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Quitar' }));

    expect(onQuitar).toHaveBeenCalledOnce();
  });

  it('keeps the name as a button when it also opens something, and names the remove button', () => {
    const onClick = vi.fn();
    const onQuitar = vi.fn();
    render(
      <Chip activo onClick={onClick} onQuitar={onQuitar} etiquetaDeQuitar="Quitar mercado">
        mercado
      </Chip>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'mercado' }));
    fireEvent.click(screen.getByRole('button', { name: 'Quitar mercado' }));

    expect(onClick).toHaveBeenCalledOnce();
    expect(onQuitar).toHaveBeenCalledOnce();
  });
});
