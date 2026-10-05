// @vitest-environment jsdom
import { cleanup, fireEvent, render } from '@testing-library/react';
import { createRef } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { FilePicker } from './file-picker';

afterEach(cleanup);

describe('FilePicker', () => {
  it('hands over the chosen files and empties itself', () => {
    const onArchivos = vi.fn();
    const ref = createRef<HTMLInputElement>();
    render(<FilePicker ref={ref} accept="image/png" multiple onArchivos={onArchivos} />);

    const campo = ref.current!;
    expect(campo.type).toBe('file');
    expect(campo.multiple).toBe(true);
    const archivo = new File(['x'], 'recibo.png', { type: 'image/png' });
    Object.defineProperty(campo, 'files', { value: [archivo], configurable: true });
    fireEvent.change(campo);

    expect(onArchivos).toHaveBeenCalledWith([archivo]);
    expect(campo.value).toBe('');
  });

  it('hands over an empty list when the browser gives none', () => {
    const onArchivos = vi.fn();
    const ref = createRef<HTMLInputElement>();
    render(<FilePicker ref={ref} accept="image/png" onArchivos={onArchivos} />);

    Object.defineProperty(ref.current!, 'files', { value: null, configurable: true });
    fireEvent.change(ref.current!);

    expect(onArchivos).toHaveBeenCalledWith([]);
  });
});
