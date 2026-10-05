// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { ICONOS_DE_CATEGORIA, IconoDeCategoria } from './iconos';

afterEach(cleanup);

describe('IconoDeCategoria', () => {
  it('draws every icon offered to the user', () => {
    for (const { nombre } of ICONOS_DE_CATEGORIA) {
      const { container, unmount } = render(<IconoDeCategoria nombre={nombre} />);
      expect(container.querySelector('svg'), nombre).not.toBeNull();
      unmount();
    }
  });

  it('offers each icon once, with a Spanish label', () => {
    const names = ICONOS_DE_CATEGORIA.map((i) => i.nombre);

    expect(new Set(names).size).toBe(names.length);
    for (const { etiqueta } of ICONOS_DE_CATEGORIA) expect(etiqueta.trim()).not.toBe('');
  });

  it('is decorative', () => {
    const { container } = render(<IconoDeCategoria nombre="wallet" className="size-5" />);

    const svg = container.querySelector('svg')!;
    expect(svg.getAttribute('aria-hidden')).toBe('true');
    expect(svg.getAttribute('class')).toContain('size-5');
  });

  it.each([null, '', 'not-an-icon'])('draws nothing for %s', (nombre) => {
    const { container } = render(<IconoDeCategoria nombre={nombre} />);

    expect(container.innerHTML).toBe('');
  });
});
