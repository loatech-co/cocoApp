// @vitest-environment jsdom
import { cleanup, fireEvent, render } from '@testing-library/react';
import { createRef } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { FilePicker } from './file-picker';

afterEach(cleanup);

describe('FilePicker', () => {
  it('hands over the chosen files and empties itself', () => {
    const onFiles = vi.fn();
    const ref = createRef<HTMLInputElement>();
    render(<FilePicker ref={ref} accept="image/png" multiple onFiles={onFiles} />);

    const field = ref.current!;
    expect(field.type).toBe('file');
    expect(field.multiple).toBe(true);
    const file = new File(['x'], 'recibo.png', { type: 'image/png' });
    Object.defineProperty(field, 'files', { value: [file], configurable: true });
    fireEvent.change(field);

    expect(onFiles).toHaveBeenCalledWith([file]);
    expect(field.value).toBe('');
  });

  it('hands over an empty list when the browser gives none', () => {
    const onFiles = vi.fn();
    const ref = createRef<HTMLInputElement>();
    render(<FilePicker ref={ref} accept="image/png" onFiles={onFiles} />);

    Object.defineProperty(ref.current!, 'files', { value: null, configurable: true });
    fireEvent.change(ref.current!);

    expect(onFiles).toHaveBeenCalledWith([]);
  });
});
