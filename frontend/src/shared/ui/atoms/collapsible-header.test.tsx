// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { CollapsibleHeader } from './collapsible-header';

afterEach(cleanup);

describe('CollapsibleHeader', () => {
  it.each([true, false])('says whether it is open (%s) and toggles', (abierta) => {
    const onAlternar = vi.fn();
    render(
      <CollapsibleHeader abierta={abierta} onAlternar={onAlternar}>
        Hogar
      </CollapsibleHeader>,
    );

    const cabecera = screen.getByRole('button', { name: 'Hogar' });
    expect(cabecera.getAttribute('aria-expanded')).toBe(String(abierta));
    fireEvent.click(cabecera);
    expect(onAlternar).toHaveBeenCalledOnce();
  });
});
