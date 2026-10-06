// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useOnChange } from './on-change';

/**
 * Lo que se prueba es la FIDELIDAD a `useEffect`, porque eso es lo que
 * sustituye: si reaccionara en momentos distintos, doce pantallas cambiarían
 * de comportamiento a la vez.
 */
afterEach(cleanup);

function Probe({ signature, onChange }: { signature: readonly unknown[]; onChange: () => void }) {
  useOnChange(signature, onChange);
  return null;
}

describe('Reaccionar a un cambio de fuera', () => {
  it('reacciona al montar, como un efecto', () => {
    const onChange = vi.fn();
    render(<Probe signature={[1]} onChange={onChange} />);
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('no reacciona si se vuelve a pintar con lo mismo', () => {
    const onChange = vi.fn();
    const { rerender } = render(<Probe signature={[1, 'a']} onChange={onChange} />);
    rerender(<Probe signature={[1, 'a']} onChange={onChange} />);
    rerender(<Probe signature={[1, 'a']} onChange={onChange} />);
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('reacciona cuando cambia cualquiera de los valores', () => {
    const onChange = vi.fn();
    const { rerender } = render(<Probe signature={[1, 'a']} onChange={onChange} />);
    rerender(<Probe signature={[2, 'a']} onChange={onChange} />);
    expect(onChange).toHaveBeenCalledTimes(2);
    rerender(<Probe signature={[2, 'b']} onChange={onChange} />);
    expect(onChange).toHaveBeenCalledTimes(3);
  });

  it('compara por identidad, como el array de dependencias', () => {
    // Un objeto nuevo con el mismo contenido ES un cambio. Es lo que hacía el
    // efecto, y la ficha de un movimiento depende de ello: `movimiento` llega
    // como objeto nuevo cada vez que se abre.
    const onChange = vi.fn();
    const same = { id: 1 };
    const { rerender } = render(<Probe signature={[same]} onChange={onChange} />);
    rerender(<Probe signature={[same]} onChange={onChange} />);
    expect(onChange).toHaveBeenCalledTimes(1);
    rerender(<Probe signature={[{ id: 1 }]} onChange={onChange} />);
    expect(onChange).toHaveBeenCalledTimes(2);
  });

  it('la reacción puede cambiar estado y el render sale ya con el valor nuevo', () => {
    // Es el motivo de que esto exista: sin fotograma intermedio.
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
    // Ningún render terminó mostrando «3» después del cambio a 7: el que lo
    // intentó fue descartado por React antes de llegar al DOM.
    const indexOf7 = seen.indexOf('7');
    expect(seen.slice(indexOf7)).not.toContain('3');
  });
});
