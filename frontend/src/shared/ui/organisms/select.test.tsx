// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { Tag } from 'lucide-react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { Select } from './select';

/**
 * jsdom does no layout: without this, every measurement is zero and there
 * would be nothing to check. The box is given a size so it can be verified
 * that the panel COPIES it, which is what is meant to be guaranteed.
 */
beforeAll(() => {
  Element.prototype.getBoundingClientRect = function (): DOMRect {
    return {
      width: 240,
      height: 40,
      top: 100,
      left: 32,
      right: 272,
      bottom: 140,
      x: 32,
      y: 100,
      toJSON: () => ({}),
    };
  };
});

// Without `globals: true` in the config, Testing Library does not register its
// automatic cleanup: one test's DOM survives into the next and the queries
// find elements from the previous one.
afterEach(cleanup);

const OPTIONS = [
  { value: 'mensual', label: 'Cada mes' },
  { value: 'anual', label: 'Cada año' },
];

describe('The dropdown of a Select', () => {
  it('measures the same as its field', () => {
    // A panel wider than its trigger reads as another element; a narrower one
    // cuts off options the field does show whole.
    render(<Select label="Periodicidad" value="mensual" options={OPTIONS} onChange={() => {}} />);

    fireEvent.click(screen.getByRole('combobox'));

    // The floating panel, which holds the listbox.
    const panel = screen.getByRole('listbox').closest<HTMLElement>('[style]')!;
    expect(panel.style.width).toBe('240px');
  });

  it('is placed against the WINDOW, not against its box', () => {
    // It lives inside forms that scroll: with absolute positioning, the
    // container's clipping eats it.
    render(<Select label="Periodicidad" value="mensual" options={OPTIONS} onChange={() => {}} />);

    fireEvent.click(screen.getByRole('combobox'));

    // The floating panel, which holds the listbox.
    const panel = screen.getByRole('listbox').closest<HTMLElement>('[style]')!;
    expect(panel.className).toContain('fixed');
    expect(panel.style.left).toBe('32px');
    // Eight pixels below the field's bottom edge.
    expect(panel.style.top).toBe('148px');
  });

  it('shows the options and marks the chosen one', () => {
    render(<Select label="Periodicidad" value="anual" options={OPTIONS} onChange={() => {}} />);

    fireEvent.click(screen.getByRole('combobox'));

    const selected = screen.getByRole('option', { name: /Cada año/ });
    expect(selected.getAttribute('aria-selected')).toBe('true');
  });
});

describe('Select', () => {
  it('shows the label of the chosen value on its trigger', () => {
    render(<Select label="Periodicidad" value="anual" options={OPTIONS} onChange={vi.fn()} />);

    const trigger = screen.getByRole('combobox', { name: 'Periodicidad' });
    expect(trigger.textContent).toContain('Cada año');
    expect(trigger.getAttribute('aria-haspopup')).toBe('listbox');
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
  });

  it('reports the chosen option and closes', () => {
    const onChange = vi.fn();
    render(<Select label="Periodicidad" value="mensual" options={OPTIONS} onChange={onChange} />);

    fireEvent.click(screen.getByRole('combobox', { name: 'Periodicidad' }));
    fireEvent.click(screen.getByRole('option', { name: /Cada año/ }));

    expect(onChange).toHaveBeenCalledWith('anual');
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('offers the empty choice when one is allowed, and reports it as an empty string', () => {
    const onChange = vi.fn();
    render(
      <Select
        label="Periodicidad"
        value=""
        emptyLabel="Sin periodicidad"
        options={OPTIONS}
        onChange={onChange}
      />,
    );

    fireEvent.click(screen.getByRole('combobox', { name: 'Periodicidad' }));
    const empty = screen.getByRole('option', { name: /Sin periodicidad/ });
    expect(empty.getAttribute('aria-selected')).toBe('true');

    fireEvent.click(empty);

    expect(onChange).toHaveBeenCalledWith('');
  });

  it('closes with Escape without choosing anything', () => {
    const onChange = vi.fn();
    render(<Select label="Periodicidad" value="mensual" options={OPTIONS} onChange={onChange} />);

    fireEvent.click(screen.getByRole('combobox', { name: 'Periodicidad' }));
    fireEvent.keyDown(document, { key: 'Escape' });

    expect(screen.queryByRole('listbox')).toBeNull();
    expect(onChange).not.toHaveBeenCalled();
  });

  it('is not a button while disabled', () => {
    render(
      <Select label="Periodicidad" value="mensual" options={OPTIONS} onChange={vi.fn()} disabled />,
    );

    expect(screen.queryByRole('combobox')).toBeNull();
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.getByText('Cada mes').closest('[aria-disabled="true"]')).not.toBeNull();
  });

  it('is disabled when there is nothing to choose', () => {
    render(<Select label="Periodicidad" value="" options={[]} onChange={vi.fn()} />);

    expect(screen.queryByRole('combobox')).toBeNull();
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.getByText('—')).toBeTruthy();
  });

  it('draws its informative icon and its actions inside the trigger', () => {
    render(
      <Select
        label="Etiqueta"
        size="sm"
        value="mensual"
        options={OPTIONS}
        onChange={vi.fn()}
        icon={Tag}
        actions={[<span key="a">acción</span>, null]}
      />,
    );

    const trigger = screen.getByRole('combobox', { name: 'Etiqueta' });
    expect(trigger.querySelector('[data-icono]')).not.toBeNull();
    expect(trigger.textContent).toContain('acción');
  });
});

/**
 * The select-only combobox: the trigger keeps the focus, controls the
 * listbox and points at the active option, the same structure as `Combo`.
 */
describe('Select, read by a screen reader', () => {
  const activeText = (box: HTMLElement) =>
    document.getElementById(box.getAttribute('aria-activedescendant') ?? '')?.textContent;

  it('is a combobox that controls a listbox whose options are its direct children', () => {
    render(<Select label="Periodicidad" value="anual" options={OPTIONS} onChange={vi.fn()} />);

    const box = screen.getByRole('combobox', { name: 'Periodicidad' });
    expect(box.getAttribute('aria-controls')).toBeNull();
    fireEvent.click(box);

    const list = screen.getByRole('listbox', { name: 'Periodicidad' });
    expect(box.getAttribute('aria-expanded')).toBe('true');
    expect(box.getAttribute('aria-controls')).toBe(list.id);
    for (const option of within(list).getAllByRole('option')) {
      expect(option.parentElement).toBe(list);
      expect(option.tabIndex).toBe(-1);
    }
    // Opening points at the chosen option.
    expect(activeText(box)).toBe('Cada año');
  });

  it('opens with an arrow, walks with the arrows and picks with Enter', () => {
    const onChange = vi.fn();
    render(
      <Select
        label="Periodicidad"
        value=""
        emptyLabel="Sin periodicidad"
        options={OPTIONS}
        onChange={onChange}
      />,
    );
    const box = screen.getByRole('combobox', { name: 'Periodicidad' });

    fireEvent.keyDown(box, { key: 'ArrowDown' });
    expect(screen.getByRole('listbox')).toBeTruthy();
    expect(activeText(box)).toBe('Sin periodicidad');

    fireEvent.keyDown(box, { key: 'ArrowDown' });
    fireEvent.keyDown(box, { key: 'ArrowDown' });
    expect(activeText(box)).toBe('Cada año');
    fireEvent.keyDown(box, { key: 'ArrowUp' });
    expect(activeText(box)).toBe('Cada mes');

    fireEvent.keyDown(box, { key: 'Enter' });
    expect(onChange).toHaveBeenCalledWith('mensual');
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(box.getAttribute('aria-activedescendant')).toBeNull();
  });
});
