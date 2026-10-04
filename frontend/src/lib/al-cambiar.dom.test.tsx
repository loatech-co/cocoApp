// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useAlCambiar } from './al-cambiar';

/**
 * Lo que se prueba es la FIDELIDAD a `useEffect`, porque eso es lo que
 * sustituye: si reaccionara en momentos distintos, doce pantallas cambiarían
 * de comportamiento a la vez.
 */
afterEach(cleanup);

function Sonda({ firma, al }: { firma: readonly unknown[]; al: () => void }) {
  useAlCambiar(firma, al);
  return null;
}

describe('Reaccionar a un cambio de fuera', () => {
  it('reacciona al montar, como un efecto', () => {
    const al = vi.fn();
    render(<Sonda firma={[1]} al={al} />);
    expect(al).toHaveBeenCalledTimes(1);
  });

  it('no reacciona si se vuelve a pintar con lo mismo', () => {
    const al = vi.fn();
    const { rerender } = render(<Sonda firma={[1, 'a']} al={al} />);
    rerender(<Sonda firma={[1, 'a']} al={al} />);
    rerender(<Sonda firma={[1, 'a']} al={al} />);
    expect(al).toHaveBeenCalledTimes(1);
  });

  it('reacciona cuando cambia cualquiera de los valores', () => {
    const al = vi.fn();
    const { rerender } = render(<Sonda firma={[1, 'a']} al={al} />);
    rerender(<Sonda firma={[2, 'a']} al={al} />);
    expect(al).toHaveBeenCalledTimes(2);
    rerender(<Sonda firma={[2, 'b']} al={al} />);
    expect(al).toHaveBeenCalledTimes(3);
  });

  it('compara por identidad, como el array de dependencias', () => {
    // Un objeto nuevo con el mismo contenido ES un cambio. Es lo que hacía el
    // efecto, y la ficha de un movimiento depende de ello: `movimiento` llega
    // como objeto nuevo cada vez que se abre.
    const al = vi.fn();
    const mismo = { id: 1 };
    const { rerender } = render(<Sonda firma={[mismo]} al={al} />);
    rerender(<Sonda firma={[mismo]} al={al} />);
    expect(al).toHaveBeenCalledTimes(1);
    rerender(<Sonda firma={[{ id: 1 }]} al={al} />);
    expect(al).toHaveBeenCalledTimes(2);
  });

  it('la reacción puede cambiar estado y el render sale ya con el valor nuevo', () => {
    // Es el motivo de que esto exista: sin fotograma intermedio.
    const vistos: string[] = [];
    function Campo({ dia }: { dia: number }) {
      const [escrito, setEscrito] = useState(String(dia));
      useAlCambiar([dia], () => setEscrito(String(dia)));
      vistos.push(escrito);
      return <output>{escrito}</output>;
    }
    const { rerender, container } = render(<Campo dia={3} />);
    rerender(<Campo dia={7} />);
    expect(container.textContent).toBe('7');
    // Ningún render terminó mostrando «3» después del cambio a 7: el que lo
    // intentó fue descartado por React antes de llegar al DOM.
    const indiceDel7 = vistos.indexOf('7');
    expect(vistos.slice(indiceDel7)).not.toContain('3');
  });
});
