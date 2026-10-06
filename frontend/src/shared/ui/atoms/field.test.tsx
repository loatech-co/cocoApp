// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { Select } from '@/shared/ui/organisms/select';

import { Field } from './field';
import { Input } from './input';
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
      <Field label="Concepto" id="c">
        <Input id="c" />
      </Field>,
    );

    const box = container.querySelector('.campo');
    expect(box).not.toBeNull();
    expect(box?.children).toHaveLength(2);
    expect(box?.children[0]!.tagName).toBe('INPUT');
    expect(box?.children[1]!.tagName).toBe('LABEL');
  });

  it('ata la etiqueta al control', () => {
    const { container } = render(
      <Field label="Concepto" id="mi-campo">
        <Input id="mi-campo" />
      </Field>,
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
    const withOwn = render(<Input placeholder="dd/mm/aaaa" />);
    expect(withOwn.container.querySelector('input')?.getAttribute('placeholder')).toBe(
      'dd/mm/aaaa',
    );
  });

  it('un área de texto también', () => {
    const { container } = render(<Textarea />);
    expect(container.querySelector('textarea')?.getAttribute('placeholder')).toBe(' ');
  });

  it('dentro de un campo, el marcador está apagado hasta que hay foco', () => {
    // Esto se rompió una vez y se veía así: la etiqueta centrada y el
    // marcador ocho píxeles más abajo, cruzándose. El apagado estaba en la
    // hoja de estilos, en la capa `components`, y el
    // `placeholder:text-muted-foreground` del propio campo le ganaba.
    const inside = render(
      <Field label="Valor" id="v">
        <Input id="v" placeholder="0" />
      </Field>,
    );
    const classes = inside.container.querySelector('input')?.className ?? '';
    expect(classes).toContain('placeholder:text-transparent');
    expect(classes).toContain('focus:placeholder:text-muted-foreground');

    cleanup();

    // Y fuera de un campo no hay etiqueta que estorbe: el marcador se ve.
    const outside = render(<Input placeholder="Buscar…" />);
    expect(outside.container.querySelector('input')?.className).toContain(
      'placeholder:text-muted-foreground',
    );
  });

  it('un desplegable dice si tiene algo elegido, y esconde su «sin elegir» si no', () => {
    const options = [{ valor: '1', etiqueta: 'Arriendo' }];

    const empty = render(
      <Select
        etiqueta="Concepto"
        valor=""
        vacio="Sin elegir"
        opciones={options}
        onCambiar={() => {}}
      />,
    );
    expect(empty.container.querySelector('[data-lleno]')?.getAttribute('data-lleno')).toBe('no');
    // Con `data-vacio` puesto, el CSS lo esconde mientras la etiqueta ocupa su
    // sitio; sin él se verían los dos textos pisándose.
    expect(empty.container.querySelector('[data-vacio]')).not.toBeNull();

    cleanup();

    const filled = render(
      <Select
        etiqueta="Concepto"
        valor="1"
        vacio="Sin elegir"
        opciones={options}
        onCambiar={() => {}}
      />,
    );
    expect(filled.container.querySelector('[data-lleno]')?.getAttribute('data-lleno')).toBe('si');
    expect(filled.container.querySelector('[data-vacio]')).toBeNull();
  });

  it('el campo de texto reserva sitio para sus iconos', () => {
    const Person = () => <svg data-prueba="persona" />;

    const left = render(<Input icon={Person} />);
    expect(left.container.querySelector('input')?.className).toContain('pl-9');
    // `data-icono` es lo que corre la etiqueta para que no caiga encima.
    expect(left.container.querySelector('[data-icono]')).not.toBeNull();

    cleanup();

    const two = render(<Input actions={[<button key="a" />, <button key="b" />]} />);
    expect(two.container.querySelector('input')?.className).toContain('pr-19');
  });
});

/** Los archivos del proyecto, para la comprobación que lee el código. */
function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sources(path);
    return path.endsWith('.tsx') ? [path] : [];
  });
}

describe('Ningún formulario vuelve a poner el nombre encima del campo', () => {
  const files = sources(join(import.meta.dirname, '..', '..', '..'));

  it('encuentra los archivos del proyecto', () => {
    expect(files.length).toBeGreaterThan(10);
  });

  it('nadie usa <Label> suelto en una pantalla', () => {
    // `Label` sigue existiendo —lo usa `Campo` por dentro, y una casilla o un
    // interruptor lo necesitan porque su nombre va al LADO y no dentro—, pero
    // una pantalla que lo escriba está volviendo a poner el nombre encima del
    // campo, y entonces la mitad del formulario flota y la otra mitad no.
    const offenders: string[] = [];

    for (const path of files) {
      const relative = path.split('/src/')[1]!;
      if (relative.startsWith('shared/ui/')) continue;

      for (const usage of readFileSync(path, 'utf8').matchAll(/<Label\b[^>]*>/g)) {
        offenders.push(`${relative}: ${usage[0].replace(/\s+/g, ' ').slice(0, 70)}`);
      }
    }

    expect(offenders, 'usa Campo: la etiqueta va dentro del control y flota').toEqual([]);
  });
});
