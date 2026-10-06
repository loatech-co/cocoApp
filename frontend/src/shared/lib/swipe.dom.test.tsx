// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react';
import { useRef } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { CLOSE_THRESHOLD, progressAlong, canScrollToward, useSwipeToClose } from './swipe';

afterEach(cleanup);

/**
 * Se despachan `MouseEvent` con el nombre de los de puntero: un evento de
 * puntero ES un evento de ratón con más campos, y jsdom no trae su
 * constructor. Lo que se está probando —el umbral y el orden de los
 * fotogramas— no depende de los campos que faltan.
 */
function gesture(el: Element, steps: [x: number, y: number][]): void {
  const [first, ...rest] = steps;
  el.dispatchEvent(
    new MouseEvent('pointerdown', { clientX: first![0], clientY: first![1], bubbles: true }),
  );
  for (const [x, y] of rest) {
    el.dispatchEvent(new MouseEvent('pointermove', { clientX: x, clientY: y, bubbles: true }));
  }
  el.dispatchEvent(new MouseEvent('pointerup', { bubbles: true }));
}

function Panel({ onClose }: { onClose: () => void }) {
  const box = useRef<HTMLDivElement>(null);
  useSwipeToClose({ element: box, direction: 'down', isEnabled: true, onClose });
  return (
    <div ref={box} data-testid="panel">
      <div data-testid="dentro">contenido</div>
      <div data-no-swipe data-testid="suyo">
        una rejilla que se arregla
      </div>
    </div>
  );
}

describe('Deslizar para cerrar', () => {
  it('por debajo del umbral no cierra, y suelta el control', () => {
    const close = vi.fn();
    const { getByTestId } = render(<Panel onClose={close} />);
    const panel = getByTestId('panel');

    gesture(getByTestId('dentro'), [
      [100, 100],
      [100, 140],
      [100, 100 + CLOSE_THRESHOLD - 1],
    ]);

    expect(close).not.toHaveBeenCalled();
    expect(panel.style.transform).toBe('');
  });

  it('por encima del umbral cierra', () => {
    const close = vi.fn();
    const { getByTestId } = render(<Panel onClose={close} />);

    gesture(getByTestId('dentro'), [
      [100, 100],
      [100, 160],
      [100, 100 + CLOSE_THRESHOLD + 1],
    ]);

    expect(close).toHaveBeenCalledTimes(1);
  });

  it('el transform en línea sobrevive al cierre y se suelta un fotograma después', async () => {
    const close = vi.fn();
    const { getByTestId } = render(<Panel onClose={close} />);
    const panel = getByTestId('panel');

    gesture(getByTestId('dentro'), [
      [100, 100],
      [100, 160],
      [100, 400],
    ]);

    // Soltarlo ANTES devolvería el panel a su sitio durante un fotograma y lo
    // sacaría desde allí: se lee como un rebote.
    expect(panel.style.transform).toContain('translateY');

    await new Promise((done) => requestAnimationFrame(() => done(null)));
    expect(panel.style.transform).toBe('');
  });

  it('un redibujo a mitad del arrastre no borra el gesto', () => {
    const { getByTestId, rerender } = render(<Panel onClose={() => {}} />);
    const panel = getByTestId('panel');
    const inner = getByTestId('dentro');

    inner.dispatchEvent(
      new MouseEvent('pointerdown', { clientX: 100, clientY: 100, bubbles: true }),
    );
    inner.dispatchEvent(
      new MouseEvent('pointermove', { clientX: 100, clientY: 160, bubbles: true }),
    );
    expect(panel.style.transform).toContain('translateY');

    // Otra función de cierre, como la que trae cualquier render del anfitrión.
    // Si el efecto dependiera de ella, su limpieza dejaría el panel plantado
    // bajo el dedo.
    rerender(<Panel onClose={() => {}} />);

    inner.dispatchEvent(
      new MouseEvent('pointermove', { clientX: 100, clientY: 200, bubbles: true }),
    );
    expect(panel.style.transform).toBe('translateY(100px)');
  });

  it('un gesto hacia el otro lado no mueve nada', () => {
    const close = vi.fn();
    const { getByTestId } = render(<Panel onClose={close} />);
    const panel = getByTestId('panel');

    gesture(getByTestId('dentro'), [
      [100, 400],
      [100, 200],
      [100, 100],
    ]);

    expect(close).not.toHaveBeenCalled();
    expect(panel.style.transform).toBe('');
  });

  it('un gesto de lado tampoco: manda el otro eje', () => {
    const close = vi.fn();
    const { getByTestId } = render(<Panel onClose={close} />);

    gesture(getByTestId('dentro'), [
      [100, 100],
      [200, 120],
      [400, 140],
    ]);

    expect(close).not.toHaveBeenCalled();
  });

  it('una región que se queda con el puntero no se arrastra', () => {
    const close = vi.fn();
    const { getByTestId } = render(<Panel onClose={close} />);

    gesture(getByTestId('suyo'), [
      [100, 100],
      [100, 200],
      [100, 400],
    ]);

    expect(close).not.toHaveBeenCalled();
  });
});

describe('Cede ante un desplazamiento', () => {
  it('`auto` y `scroll` cuentan como desplazables; `clip` y `hidden` no', () => {
    const panel = document.createElement('div');
    const list = document.createElement('div');
    const row = document.createElement('div');
    list.appendChild(row);
    panel.appendChild(list);
    document.body.appendChild(panel);

    list.style.overflowY = 'auto';
    Object.defineProperty(list, 'scrollTop', { value: 40, configurable: true });
    Object.defineProperty(list, 'scrollHeight', { value: 400, configurable: true });
    Object.defineProperty(list, 'clientHeight', { value: 200, configurable: true });

    // Le queda algo por enseñar hacia arriba: arrastrar hacia abajo es
    // desplazar esa lista, no cerrar el panel.
    expect(canScrollToward(row, panel, 'down')).toBe(true);
    // Hacia arriba también le queda.
    expect(canScrollToward(row, panel, 'up')).toBe(true);

    Object.defineProperty(list, 'scrollTop', { value: 0, configurable: true });
    // Ya está en su borde: el gesto es del panel.
    expect(canScrollToward(row, panel, 'down')).toBe(false);

    list.style.overflowY = 'clip';
    Object.defineProperty(list, 'scrollTop', { value: 40, configurable: true });
    expect(canScrollToward(row, panel, 'down')).toBe(false);

    document.body.removeChild(panel);
  });
});

describe('El avance se mide hacia donde cierra', () => {
  it.each([
    ['down' as const, 0, 30, 30],
    ['up' as const, 0, -30, 30],
    ['right' as const, 30, 0, 30],
    ['left' as const, -30, 0, 30],
  ])('%s', (direction, dx, dy, expected) => {
    expect(progressAlong(direction, dx, dy)).toBe(expected);
  });
});
