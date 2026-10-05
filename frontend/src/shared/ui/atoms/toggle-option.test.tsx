// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ToggleOption } from './toggle-option';

afterEach(cleanup);

describe('ToggleOption', () => {
  it.each([true, false])('announces whether it is on (%s)', (encendida) => {
    const onClick = vi.fn();
    render(
      <ToggleOption encendida={encendida} onClick={onClick}>
        Este mes
      </ToggleOption>,
    );

    const opcion = screen.getByRole('button', { name: 'Este mes' });
    expect(opcion.getAttribute('aria-pressed')).toBe(String(encendida));
    expect(opcion.className.includes('text-primary')).toBe(encendida);
    fireEvent.click(opcion);
    expect(onClick).toHaveBeenCalledOnce();
  });
});
