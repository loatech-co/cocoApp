// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ToggleOption } from './toggle-option';

afterEach(cleanup);

describe('ToggleOption', () => {
  it.each([true, false])('announces whether it is on (%s)', (isOn) => {
    const onClick = vi.fn();
    render(
      <ToggleOption isOn={isOn} onClick={onClick}>
        Este mes
      </ToggleOption>,
    );

    const option = screen.getByRole('button', { name: 'Este mes' });
    expect(option.getAttribute('aria-pressed')).toBe(String(isOn));
    expect(option.className.includes('text-primary')).toBe(isOn);
    fireEvent.click(option);
    expect(onClick).toHaveBeenCalledOnce();
  });
});
