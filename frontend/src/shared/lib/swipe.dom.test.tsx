// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react';
import { useRef } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { CLOSE_THRESHOLD, progressAlong, canScrollToward, useSwipeToClose } from './swipe';

afterEach(cleanup);

/**
 * `MouseEvent`s are dispatched with the names of the pointer ones: a pointer
 * event IS a mouse event with more fields, and jsdom does not ship its
 * constructor. What is being tested —the threshold and the order of the
 * frames— does not depend on the missing fields.
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
      <div data-testid="inside">contenido</div>
      <div data-no-swipe data-testid="own">
        una rejilla que se arregla
      </div>
    </div>
  );
}

describe('Swipe to close', () => {
  it('below the threshold it does not close, and releases the control', () => {
    const close = vi.fn();
    const { getByTestId } = render(<Panel onClose={close} />);
    const panel = getByTestId('panel');

    gesture(getByTestId('inside'), [
      [100, 100],
      [100, 140],
      [100, 100 + CLOSE_THRESHOLD - 1],
    ]);

    expect(close).not.toHaveBeenCalled();
    expect(panel.style.transform).toBe('');
  });

  it('above the threshold it closes', () => {
    const close = vi.fn();
    const { getByTestId } = render(<Panel onClose={close} />);

    gesture(getByTestId('inside'), [
      [100, 100],
      [100, 160],
      [100, 100 + CLOSE_THRESHOLD + 1],
    ]);

    expect(close).toHaveBeenCalledTimes(1);
  });

  it('the inline transform survives the close and is released one frame later', async () => {
    const close = vi.fn();
    const { getByTestId } = render(<Panel onClose={close} />);
    const panel = getByTestId('panel');

    gesture(getByTestId('inside'), [
      [100, 100],
      [100, 160],
      [100, 400],
    ]);

    // Releasing it BEFORE would return the panel to its place for one frame and
    // take it out from there: it reads as a bounce.
    expect(panel.style.transform).toContain('translateY');

    await new Promise((done) => requestAnimationFrame(() => done(null)));
    expect(panel.style.transform).toBe('');
  });

  it('a re-render in the middle of the drag does not erase the gesture', () => {
    const { getByTestId, rerender } = render(<Panel onClose={() => {}} />);
    const panel = getByTestId('panel');
    const inner = getByTestId('inside');

    inner.dispatchEvent(
      new MouseEvent('pointerdown', { clientX: 100, clientY: 100, bubbles: true }),
    );
    inner.dispatchEvent(
      new MouseEvent('pointermove', { clientX: 100, clientY: 160, bubbles: true }),
    );
    expect(panel.style.transform).toContain('translateY');

    // Another close function, like the one any render of the host brings.
    // If the effect depended on it, its cleanup would leave the panel stuck
    // under the finger.
    rerender(<Panel onClose={() => {}} />);

    inner.dispatchEvent(
      new MouseEvent('pointermove', { clientX: 100, clientY: 200, bubbles: true }),
    );
    expect(panel.style.transform).toBe('translateY(100px)');
  });

  it('a gesture the other way moves nothing', () => {
    const close = vi.fn();
    const { getByTestId } = render(<Panel onClose={close} />);
    const panel = getByTestId('panel');

    gesture(getByTestId('inside'), [
      [100, 400],
      [100, 200],
      [100, 100],
    ]);

    expect(close).not.toHaveBeenCalled();
    expect(panel.style.transform).toBe('');
  });

  it('a sideways gesture neither: the other axis wins', () => {
    const close = vi.fn();
    const { getByTestId } = render(<Panel onClose={close} />);

    gesture(getByTestId('inside'), [
      [100, 100],
      [200, 120],
      [400, 140],
    ]);

    expect(close).not.toHaveBeenCalled();
  });

  it('a region that keeps the pointer is not dragged', () => {
    const close = vi.fn();
    const { getByTestId } = render(<Panel onClose={close} />);

    gesture(getByTestId('own'), [
      [100, 100],
      [100, 200],
      [100, 400],
    ]);

    expect(close).not.toHaveBeenCalled();
  });
});

describe('Yields to a scroll', () => {
  it('`auto` and `scroll` count as scrollable; `clip` and `hidden` do not', () => {
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

    // It still has something to reveal upward: dragging down scrolls that
    // list, it does not close the panel.
    expect(canScrollToward(row, panel, 'down')).toBe(true);
    // Upward it has some left too.
    expect(canScrollToward(row, panel, 'up')).toBe(true);

    Object.defineProperty(list, 'scrollTop', { value: 0, configurable: true });
    // Already at its edge: the gesture belongs to the panel.
    expect(canScrollToward(row, panel, 'down')).toBe(false);

    list.style.overflowY = 'clip';
    Object.defineProperty(list, 'scrollTop', { value: 40, configurable: true });
    expect(canScrollToward(row, panel, 'down')).toBe(false);

    document.body.removeChild(panel);
  });
});

describe('Progress is measured toward where it closes', () => {
  it.each([
    ['down' as const, 0, 30, 30],
    ['up' as const, 0, -30, 30],
    ['right' as const, 30, 0, 30],
    ['left' as const, -30, 0, 30],
  ])('%s', (direction, dx, dy, expected) => {
    expect(progressAlong(direction, dx, dy)).toBe(expected);
  });
});
