// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react';
import { useRef } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { UMBRAL_DE_CIERRE, avanceDe, puedeDesplazarse, useDeslizarParaCerrar } from './deslizar';

afterEach(cleanup);

/**
 * Se despachan `MouseEvent` con el nombre de los de puntero: un evento de
 * puntero ES un evento de ratón con más campos, y jsdom no trae su
 * constructor. Lo que se está probando —el umbral y el orden de los
 * fotogramas— no depende de los campos que faltan.
 */
function gesto(el: Element, tramos: [x: number, y: number][]): void {
  const [primero, ...resto] = tramos;
  el.dispatchEvent(new MouseEvent('pointerdown', { clientX: primero![0], clientY: primero![1], bubbles: true }));
  for (const [x, y] of resto) {
    el.dispatchEvent(new MouseEvent('pointermove', { clientX: x, clientY: y, bubbles: true }));
  }
  el.dispatchEvent(new MouseEvent('pointerup', { bubbles: true }));
}

function Panel({ onCerrar }: { onCerrar: () => void }) {
  const caja = useRef<HTMLDivElement>(null);
  useDeslizarParaCerrar({ elemento: caja, hacia: 'abajo', activo: true, onCerrar });
  return (
    <div ref={caja} data-testid="panel">
      <div data-testid="dentro">contenido</div>
      <div data-sin-deslizar data-testid="suyo">una rejilla que se arregla</div>
    </div>
  );
}

describe('Deslizar para cerrar', () => {
  it('por debajo del umbral no cierra, y suelta el control', () => {
    const cerrar = vi.fn();
    const { getByTestId } = render(<Panel onCerrar={cerrar} />);
    const panel = getByTestId('panel');

    gesto(getByTestId('dentro'), [[100, 100], [100, 140], [100, 100 + UMBRAL_DE_CIERRE - 1]]);

    expect(cerrar).not.toHaveBeenCalled();
    expect(panel.style.transform).toBe('');
  });

  it('por encima del umbral cierra', () => {
    const cerrar = vi.fn();
    const { getByTestId } = render(<Panel onCerrar={cerrar} />);

    gesto(getByTestId('dentro'), [[100, 100], [100, 160], [100, 100 + UMBRAL_DE_CIERRE + 1]]);

    expect(cerrar).toHaveBeenCalledTimes(1);
  });

  it('el transform en línea sobrevive al cierre y se suelta un fotograma después', async () => {
    const cerrar = vi.fn();
    const { getByTestId } = render(<Panel onCerrar={cerrar} />);
    const panel = getByTestId('panel');

    gesto(getByTestId('dentro'), [[100, 100], [100, 160], [100, 400]]);

    // Soltarlo ANTES devolvería el panel a su sitio durante un fotograma y lo
    // sacaría desde allí: se lee como un rebote.
    expect(panel.style.transform).toContain('translateY');

    await new Promise((listo) => requestAnimationFrame(() => listo(null)));
    expect(panel.style.transform).toBe('');
  });

  it('un redibujo a mitad del arrastre no borra el gesto', () => {
    const { getByTestId, rerender } = render(<Panel onCerrar={() => {}} />);
    const panel = getByTestId('panel');
    const dentro = getByTestId('dentro');

    dentro.dispatchEvent(new MouseEvent('pointerdown', { clientX: 100, clientY: 100, bubbles: true }));
    dentro.dispatchEvent(new MouseEvent('pointermove', { clientX: 100, clientY: 160, bubbles: true }));
    expect(panel.style.transform).toContain('translateY');

    // Otra función de cierre, como la que trae cualquier render del anfitrión.
    // Si el efecto dependiera de ella, su limpieza dejaría el panel plantado
    // bajo el dedo.
    rerender(<Panel onCerrar={() => {}} />);

    dentro.dispatchEvent(new MouseEvent('pointermove', { clientX: 100, clientY: 200, bubbles: true }));
    expect(panel.style.transform).toBe('translateY(100px)');
  });

  it('un gesto hacia el otro lado no mueve nada', () => {
    const cerrar = vi.fn();
    const { getByTestId } = render(<Panel onCerrar={cerrar} />);
    const panel = getByTestId('panel');

    gesto(getByTestId('dentro'), [[100, 400], [100, 200], [100, 100]]);

    expect(cerrar).not.toHaveBeenCalled();
    expect(panel.style.transform).toBe('');
  });

  it('un gesto de lado tampoco: manda el otro eje', () => {
    const cerrar = vi.fn();
    const { getByTestId } = render(<Panel onCerrar={cerrar} />);

    gesto(getByTestId('dentro'), [[100, 100], [200, 120], [400, 140]]);

    expect(cerrar).not.toHaveBeenCalled();
  });

  it('una región que se queda con el puntero no se arrastra', () => {
    const cerrar = vi.fn();
    const { getByTestId } = render(<Panel onCerrar={cerrar} />);

    gesto(getByTestId('suyo'), [[100, 100], [100, 200], [100, 400]]);

    expect(cerrar).not.toHaveBeenCalled();
  });
});

describe('Cede ante un desplazamiento', () => {
  it('`auto` y `scroll` cuentan como desplazables; `clip` y `hidden` no', () => {
    const panel = document.createElement('div');
    const lista = document.createElement('div');
    const fila = document.createElement('div');
    lista.appendChild(fila);
    panel.appendChild(lista);
    document.body.appendChild(panel);

    lista.style.overflowY = 'auto';
    Object.defineProperty(lista, 'scrollTop', { value: 40, configurable: true });
    Object.defineProperty(lista, 'scrollHeight', { value: 400, configurable: true });
    Object.defineProperty(lista, 'clientHeight', { value: 200, configurable: true });

    // Le queda algo por enseñar hacia arriba: arrastrar hacia abajo es
    // desplazar esa lista, no cerrar el panel.
    expect(puedeDesplazarse(fila, panel, 'abajo')).toBe(true);
    // Hacia arriba también le queda.
    expect(puedeDesplazarse(fila, panel, 'arriba')).toBe(true);

    Object.defineProperty(lista, 'scrollTop', { value: 0, configurable: true });
    // Ya está en su borde: el gesto es del panel.
    expect(puedeDesplazarse(fila, panel, 'abajo')).toBe(false);

    lista.style.overflowY = 'clip';
    Object.defineProperty(lista, 'scrollTop', { value: 40, configurable: true });
    expect(puedeDesplazarse(fila, panel, 'abajo')).toBe(false);

    document.body.removeChild(panel);
  });
});

describe('El avance se mide hacia donde cierra', () => {
  it.each([
    ['abajo' as const, 0, 30, 30],
    ['arriba' as const, 0, -30, 30],
    ['derecha' as const, 30, 0, 30],
    ['izquierda' as const, -30, 0, 30],
  ])('%s', (hacia, dx, dy, esperado) => {
    expect(avanceDe(hacia, dx, dy)).toBe(esperado);
  });
});
