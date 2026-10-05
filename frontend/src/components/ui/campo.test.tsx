// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { SelectorDeFecha } from '@/components/selector-de-fecha';
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

  it('dentro de un campo, el marcador está apagado hasta que hay foco', () => {
    // Esto se rompió una vez y se veía así: la etiqueta centrada y el
    // marcador ocho píxeles más abajo, cruzándose. El apagado estaba en la
    // hoja de estilos, en la capa `components`, y el
    // `placeholder:text-muted-foreground` del propio campo le ganaba.
    const dentro = render(
      <Campo etiqueta="Valor" id="v">
        <Input id="v" placeholder="0" />
      </Campo>,
    );
    const clases = dentro.container.querySelector('input')?.className ?? '';
    expect(clases).toContain('placeholder:text-transparent');
    expect(clases).toContain('focus:placeholder:text-muted-foreground');

    cleanup();

    // Y fuera de un campo no hay etiqueta que estorbe: el marcador se ve.
    const fuera = render(<Input placeholder="Buscar…" />);
    expect(fuera.container.querySelector('input')?.className).toContain(
      'placeholder:text-muted-foreground',
    );
  });

  it('un desplegable dice si tiene algo elegido, y esconde su «sin elegir» si no', () => {
    const opciones = [{ valor: '1', etiqueta: 'Arriendo' }];

    const vacio = render(
      <Select
        etiqueta="Concepto"
        valor=""
        vacio="Sin elegir"
        opciones={opciones}
        onCambiar={() => {}}
      />,
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
    const { container } = render(<SelectorDeFecha valor="2026-04-04" onElegir={() => {}} />);

    /*
      El selector de fecha SE ESCRIBE, así que la etiqueta flota por donde
      flota la de cualquier campo de texto: `:placeholder-shown`. Para que esa
      regla enganche hacen falta las dos cosas —un marcador declarado y un
      valor dentro—, y por eso se comprueban las dos y no la clase que pinta.
    */
    const campo = container.querySelector('input:not([type="hidden"])');
    expect(campo?.getAttribute('placeholder')).toBeTruthy();
    expect((campo as HTMLInputElement | null)?.value).toBe('4 de abril de 2026');

    // Y el valor viaja en ISO para el formulario, no como se escribe.
    expect(container.querySelector<HTMLInputElement>('input[type="hidden"]')?.value).toBe(
      '2026-04-04',
    );
    // El calendario es la señal de que esto abre un calendario, que es el
    // papel de la flecha en un desplegable: con las dos, había dos iconos
    // diciendo lo mismo, uno a cada lado del valor.
    expect(container.querySelector('.lucide-calendar-days')).not.toBeNull();
    expect(container.querySelector('.lucide-chevron-down')).toBeNull();
  });

  it('el valor de un selector de fecha arranca donde arranca su etiqueta', () => {
    /*
      Esto se rompió y se veía como un escalón: la etiqueta a 12px del borde y
      el valor a 20.

      La causa es de orden, no de valor: `cva` emite base, variante y tamaño en
      ese orden, así que el `px-5` del tamaño gana a cualquier `px-3` escrito en
      la variante. Lo tiene que poner la llamada, que es lo último que ve `cn`.

      Se compara contra el `Input`, que es el vecino con el que tiene que
      alinearse, y no contra un `'px-3'` literal: si algún día el relleno de
      los campos cambia, esta prueba sigue midiendo lo que importa.
    */
    const campoDeTexto = render(<Input />);
    const rellenoDelCampo = (campoDeTexto.container.querySelector('input')?.className ?? '')
      .split(/\s+/)
      .filter((c) => c.startsWith('px-'));
    expect(rellenoDelCampo).toHaveLength(1);

    cleanup();

    // La CAJA del campo, que es la que lleva el relleno. El botón de dentro es
    // el del calendario, y ese se sangra solo.
    const fecha = render(<SelectorDeFecha valor="2026-04-04" onElegir={() => {}} />);
    const caja = fecha.container.querySelector('input:not([type="hidden"])')?.parentElement;
    const rellenoDeLaFecha = (caja?.className ?? '')
      .split(/\s+/)
      .filter((c) => c.startsWith('px-'));

    expect(rellenoDeLaFecha, 'el selector de fecha se sangra como un campo de texto').toEqual(
      rellenoDelCampo,
    );
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
