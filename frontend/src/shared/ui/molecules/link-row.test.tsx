// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { User } from 'lucide-react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { FilaDeEnlace } from './link-row';

afterEach(cleanup);

describe('FilaDeEnlace', () => {
  it('is a link to its page, named by its text', () => {
    render(
      <MemoryRouter>
        <FilaDeEnlace Icono={User} a="/perfil">
          Perfil
        </FilaDeEnlace>
      </MemoryRouter>,
    );

    const link = screen.getByRole('link', { name: 'Perfil' });
    expect(link.getAttribute('href')).toBe('/perfil');
    expect(link.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
  });

  it('tells the caller when it is followed, so a sheet can close', () => {
    const onIr = vi.fn();
    render(
      <MemoryRouter>
        <FilaDeEnlace Icono={User} a="/perfil" onIr={onIr}>
          Perfil
        </FilaDeEnlace>
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole('link', { name: 'Perfil' }));

    expect(onIr).toHaveBeenCalledOnce();
  });
});
