// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { Tag } from 'lucide-react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { Select } from './select';

/**
 * jsdom no hace diseño: sin esto, cualquier medida da cero y no habría nada
 * que comprobar. Se le pone un tamaño a la caja para poder verificar que el
 * panel lo COPIA, que es lo que se quiere garantizar.
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

// Sin `globals: true` en la configuración, Testing Library no registra su
// limpieza automática: el DOM de una prueba sobrevive a la siguiente y las
// consultas encuentran elementos de la anterior.
afterEach(cleanup);

const OPTIONS = [
  { value: 'mensual', label: 'Cada mes' },
  { value: 'anual', label: 'Cada año' },
];

describe('El desplegable de un Select', () => {
  it('mide lo mismo que su campo', () => {
    // Un panel más ancho que su disparador se lee como otro elemento; uno más
    // angosto corta opciones que el campo sí muestra enteras.
    render(<Select label="Periodicidad" value="mensual" options={OPTIONS} onChange={() => {}} />);

    fireEvent.click(screen.getAllByRole('button')[0]!);

    const panel = screen.getByRole('listbox');
    expect(panel.style.width).toBe('240px');
  });

  it('se coloca contra la VENTANA, no contra su caja', () => {
    // Vive dentro de formularios que se desplazan: con posición absoluta, el
    // recorte del contenedor se lo come.
    render(<Select label="Periodicidad" value="mensual" options={OPTIONS} onChange={() => {}} />);

    fireEvent.click(screen.getAllByRole('button')[0]!);

    const panel = screen.getByRole('listbox');
    expect(panel.className).toContain('fixed');
    expect(panel.style.left).toBe('32px');
    // Ocho píxeles bajo el borde inferior del campo.
    expect(panel.style.top).toBe('148px');
  });

  it('muestra las opciones y marca la elegida', () => {
    render(<Select label="Periodicidad" value="anual" options={OPTIONS} onChange={() => {}} />);

    fireEvent.click(screen.getAllByRole('button')[0]!);

    const selected = screen.getByRole('option', { name: /Cada año/ });
    expect(selected.getAttribute('aria-selected')).toBe('true');
  });
});

describe('Select', () => {
  it('shows the label of the chosen value on its trigger', () => {
    render(<Select label="Periodicidad" value="anual" options={OPTIONS} onChange={vi.fn()} />);

    const trigger = screen.getByRole('button', { name: /Cada año/ });
    expect(trigger.getAttribute('aria-haspopup')).toBe('listbox');
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
  });

  it('reports the chosen option and closes', () => {
    const onChange = vi.fn();
    render(<Select label="Periodicidad" value="mensual" options={OPTIONS} onChange={onChange} />);

    fireEvent.click(screen.getByRole('button', { name: /Cada mes/ }));
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

    fireEvent.click(screen.getByRole('button', { name: /Sin periodicidad/ }));
    const empty = screen.getByRole('option', { name: /Sin periodicidad/ });
    expect(empty.getAttribute('aria-selected')).toBe('true');

    fireEvent.click(empty);

    expect(onChange).toHaveBeenCalledWith('');
  });

  it('closes with Escape without choosing anything', () => {
    const onChange = vi.fn();
    render(<Select label="Periodicidad" value="mensual" options={OPTIONS} onChange={onChange} />);

    fireEvent.click(screen.getByRole('button', { name: /Cada mes/ }));
    fireEvent.keyDown(document, { key: 'Escape' });

    expect(screen.queryByRole('listbox')).toBeNull();
    expect(onChange).not.toHaveBeenCalled();
  });

  it('is not a button while disabled', () => {
    render(
      <Select label="Periodicidad" value="mensual" options={OPTIONS} onChange={vi.fn()} disabled />,
    );

    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.getByText('Cada mes').closest('[aria-disabled="true"]')).not.toBeNull();
  });

  it('is disabled when there is nothing to choose', () => {
    render(<Select label="Periodicidad" value="" options={[]} onChange={vi.fn()} />);

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

    const trigger = screen.getByRole('button', { name: /Cada mes/ });
    expect(trigger.querySelector('[data-icono]')).not.toBeNull();
    expect(trigger.textContent).toContain('acción');
  });
});
