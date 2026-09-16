// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { SelectorDeDia } from '@/components/selector-de-dia';
import { Campo } from './campo';
import { Input } from './input';
import { Select } from './select';
import { Textarea } from './textarea';

afterEach(cleanup);

/**
 * La etiqueta flotante es una máquina de estados repartida entre CSS y React,
 * y las dos mitades se rompen sin hacer ruido.
 *
 * Lo que se comprueba aquí es lo que el CSS necesita que el marcado le dé:
 * el orden de los hermanos, el atributo de marcador que hace funcionar
 * `:placeholder-shown`, y los `data-` con los que un desplegable dice si tiene
 * algo elegido. La posición y el tamaño de la etiqueta son CSS y jsdom no los
 * calcula; lo que sí se puede exigir es que los ganchos existan, porque sin
 * ellos la etiqueta se queda abajo tapando un valor o arriba sobre un campo
 * vacío, y las dos cosas se ven igual de mal.
 */
describe('El campo con etiqueta flotante', () => {
  it('pone el control ANTES de la etiqueta', () => {
    // El orden importa: los selectores de `.campo` en `index.css` buscan la
    // etiqueta como `> label` dentro de una caja que ya contiene el control.
    // Con la etiqueta primero, el marcado sigue leyéndose igual y ninguna de
    // las reglas engancha.
    const { container } = render(
      <Campo etiqueta="Concepto" id="c">
        <Input id="c" />
      </Campo>,
    );

    const caja = container.querySelector('.campo');
    expect(caja).not.toBeNull();
    expect(caja?.children).toHaveLength(2);
    expect(caja?.children[0].tagName).toBe('INPUT');
    expect(caja?.children[1].tagName).toBe('LABEL');
  });

  it('ata la etiqueta al control', () => {
    const { container } = render(
      <Campo etiqueta="Concepto" id="mi-campo">
        <Input id="mi-campo" />
      </Campo>,
    );

    expect(container.querySelector('label')?.getAttribute('for')).toBe('mi-campo');
    expect(container.querySelector('input')?.id).toBe('mi-campo');
  });

  it('un campo de texto SIEMPRE lleva marcador, aunque nadie le pase uno', () => {
    // Es lo que hace que `:placeholder-shown` funcione. Sin atributo, el
    // selector no engancha nunca y la etiqueta se queda arriba desde el
    // principio, sobre un campo vacío.
    const { container } = render(<Input />);
    expect(container.querySelector('input')?.getAttribute('placeholder')).toBe(' ');

    cleanup();
    const conSuyo = render(<Input placeholder="dd/mm/aaaa" />);
    expect(conSuyo.container.querySelector('input')?.getAttribute('placeholder')).toBe(
      'dd/mm/aaaa',
    );
  });

  it('un área de texto también', () => {
    const { container } = render(<Textarea />);
    expect(container.querySelector('textarea')?.getAttribute('placeholder')).toBe(' ');
  });

  it('un desplegable dice si tiene algo elegido, y esconde su «sin elegir» si no', () => {
    const opciones = [{ valor: '1', etiqueta: 'Arriendo' }];

    const vacio = render(
      <Select etiqueta="Concepto" valor="" vacio="Sin elegir" opciones={opciones} onCambiar={() => {}} />,
    );
    expect(vacio.container.querySelector('[data-lleno]')?.getAttribute('data-lleno')).toBe('no');
    // Con `data-vacio` puesto, el CSS lo esconde mientras la etiqueta ocupa su
    // sitio; sin él se verían los dos textos pisándose.
    expect(vacio.container.querySelector('[data-vacio]')).not.toBeNull();

    cleanup();

    const lleno = render(
      <Select
        etiqueta="Concepto"
        valor="1"
        vacio="Sin elegir"
        opciones={opciones}
        onCambiar={() => {}}
      />,
    );
    expect(lleno.container.querySelector('[data-lleno]')?.getAttribute('data-lleno')).toBe('si');
    expect(lleno.container.querySelector('[data-vacio]')).toBeNull();
  });

  it('el selector de fecha dice lo mismo, y su icono va al final sin flecha', () => {
    const { container } = render(<SelectorDeDia valor="2026-04-04" onElegir={() => {}} />);

    expect(container.querySelector('[data-lleno]')?.getAttribute('data-lleno')).toBe('si');
    // El calendario es la señal de que esto abre un calendario, que es el
    // papel de la flecha en un desplegable: con las dos, había dos iconos
    // diciendo lo mismo, uno a cada lado del valor.
    expect(container.querySelector('.lucide-calendar-days')).not.toBeNull();
    expect(container.querySelector('.lucide-chevron-down')).toBeNull();
  });

  it('el campo de texto reserva sitio para sus iconos', () => {
    const Persona = () => <svg data-prueba="persona" />;

    const izquierda = render(<Input icono={Persona} />);
    expect(izquierda.container.querySelector('input')?.className).toContain('pl-9');
    // `data-icono` es lo que corre la etiqueta para que no caiga encima.
    expect(izquierda.container.querySelector('[data-icono]')).not.toBeNull();

    cleanup();

    const dos = render(<Input acciones={[<button key="a" />, <button key="b" />]} />);
    expect(dos.container.querySelector('input')?.className).toContain('pr-19');
  });
});

/** Los archivos del proyecto, para la comprobación que lee el código. */
function fuentes(dir: string): string[] {
  return readdirSync(dir).flatMap((nombre) => {
    const ruta = join(dir, nombre);
    if (statSync(ruta).isDirectory()) return fuentes(ruta);
    return ruta.endsWith('.tsx') ? [ruta] : [];
  });
}

describe('Ningún formulario vuelve a poner el nombre encima del campo', () => {
  const archivos = fuentes(join(import.meta.dirname, '..', '..'));

  it('encuentra los archivos del proyecto', () => {
    expect(archivos.length).toBeGreaterThan(10);
  });

  it('nadie usa <Label> suelto en una pantalla', () => {
    // `Label` sigue existiendo —lo usa `Campo` por dentro, y una casilla o un
    // interruptor lo necesitan porque su nombre va al LADO y no dentro—, pero
    // una pantalla que lo escriba está volviendo a poner el nombre encima del
    // campo, y entonces la mitad del formulario flota y la otra mitad no.
    const culpables: string[] = [];

    for (const ruta of archivos) {
      const relativa = ruta.split('/src/')[1];
      if (relativa.startsWith('components/ui/')) continue;

      for (const uso of readFileSync(ruta, 'utf8').matchAll(/<Label\b[^>]*>/g)) {
        culpables.push(`${relativa}: ${uso[0].replace(/\s+/g, ' ').slice(0, 70)}`);
      }
    }

    expect(culpables, 'usa Campo: la etiqueta va dentro del control y flota').toEqual([]);
  });
});
