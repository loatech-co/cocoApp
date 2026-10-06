// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useOnChange } from './on-change';

/**
 * What is tested is FIDELITY to `useEffect`, because that is what it
 * replaces: if it reacted at different moments, twelve screens would change
 * behavior at once.
 */
afterEach(cleanup);

function Probe({ signature, onChange }: { signature: readonly unknown[]; onChange: () => void }) {
  useOnChange(signature, onChange);
  return null;
}

describe('Reacting to a change from outside', () => {
  it('reacts on mount, like an effect', () => {
    const onChange = vi.fn();
    render(<Probe signature={[1]} onChange={onChange} />);
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('does not react when rendered again with the same values', () => {
    const onChange = vi.fn();
    const { rerender } = render(<Probe signature={[1, 'a']} onChange={onChange} />);
    rerender(<Probe signature={[1, 'a']} onChange={onChange} />);
    rerender(<Probe signature={[1, 'a']} onChange={onChange} />);
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('reacts when any of the values changes', () => {
    const onChange = vi.fn();
    const { rerender } = render(<Probe signature={[1, 'a']} onChange={onChange} />);
    rerender(<Probe signature={[2, 'a']} onChange={onChange} />);
    expect(onChange).toHaveBeenCalledTimes(2);
    rerender(<Probe signature={[2, 'b']} onChange={onChange} />);
    expect(onChange).toHaveBeenCalledTimes(3);
  });

  it('compares by identity, like the dependency array', () => {
    // A new object with the same contents IS a change. That is what the
    // effect did, and a movement's sheet depends on it: `movimiento` arrives
    // as a new object every time it opens.
    const onChange = vi.fn();
    const same = { id: 1 };
    const { rerender } = render(<Probe signature={[same]} onChange={onChange} />);
    rerender(<Probe signature={[same]} onChange={onChange} />);
    expect(onChange).toHaveBeenCalledTimes(1);
    rerender(<Probe signature={[{ id: 1 }]} onChange={onChange} />);
    expect(onChange).toHaveBeenCalledTimes(2);
  });

  it('the reaction can change state and the render already comes out with the new value', () => {
    // It is the reason this exists: no intermediate frame.
    const seen: string[] = [];
    function Field({ day }: { day: number }) {
      const [typed, setTyped] = useState(String(day));
      useOnChange([day], () => setTyped(String(day)));
      seen.push(typed);
      return <output>{typed}</output>;
    }
    const { rerender, container } = render(<Field day={3} />);
    rerender(<Field day={7} />);
    expect(container.textContent).toBe('7');
    // No render ended up showing «3» after the change to 7: the one that
    // tried was discarded by React before reaching the DOM.
    const indexOf7 = seen.indexOf('7');
    expect(seen.slice(indexOf7)).not.toContain('3');
  });
});
