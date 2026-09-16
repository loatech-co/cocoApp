// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';

import { Select } from './select';

/**
 * jsdom no hace diseño: sin esto, cualquier medida da cero y no habría nada
 * que comprobar. Se le pone un tamaño a la caja para poder verificar que el
 * panel lo COPIA, que es lo que se quiere garantizar.
 */
beforeAll(() => {
  Element.prototype.getBoundingClientRect = function (): DOMRect {
    return { width: 240, height: 40, top: 100, left: 32, right: 272, bottom: 140, x: 32, y: 100, toJSON: () => ({}) } as DOMRect;
  };
});

// Sin `globals: true` en la configuración, Testing Library no registra su
// limpieza automática: el DOM de una prueba sobrevive a la siguiente y las
// consultas encuentran elementos de la anterior.
afterEach(cleanup);

const OPCIONES = [
  { valor: 'mensual', etiqueta: 'Cada mes' },
  { valor: 'anual', etiqueta: 'Cada año' },
];

describe('El desplegable de un Select', () => {
  it('mide lo mismo que su campo', () => {
    // Un panel más ancho que su disparador se lee como otro elemento; uno más
    // angosto corta opciones que el campo sí muestra enteras.
    render(
      <Select etiqueta="Periodicidad" valor="mensual" opciones={OPCIONES} onCambiar={() => {}} />,
    );

    fireEvent.click(screen.getAllByRole('button')[0]);

    const panel = screen.getByRole('listbox');
    expect(panel.style.width).toBe('240px');
  });

  it('se coloca contra la VENTANA, no contra su caja', () => {
    // Vive dentro de formularios que se desplazan: con posición absoluta, el
    // recorte del contenedor se lo come.
    render(
      <Select etiqueta="Periodicidad" valor="mensual" opciones={OPCIONES} onCambiar={() => {}} />,
    );

    fireEvent.click(screen.getAllByRole('button')[0]);

    const panel = screen.getByRole('listbox');
    expect(panel.className).toContain('fixed');
    expect(panel.style.left).toBe('32px');
    // Ocho píxeles bajo el borde inferior del campo.
    expect(panel.style.top).toBe('148px');
  });

  it('muestra las opciones y marca la elegida', () => {
    render(
      <Select etiqueta="Periodicidad" valor="anual" opciones={OPCIONES} onCambiar={() => {}} />,
    );

    fireEvent.click(screen.getAllByRole('button')[0]);

    const elegida = screen.getByRole('option', { name: /Cada año/ });
    expect(elegida.getAttribute('aria-selected')).toBe('true');
  });
});
