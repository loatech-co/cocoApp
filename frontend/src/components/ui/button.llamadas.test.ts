import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * Esta prueba no mira el componente: mira QUIÉN LO USA.
 *
 * La prueba de al lado demuestra que todas las variantes salen del mismo alto,
 * y aun así seguían apareciendo botones desparejos. Faltaba esto: un
 * `className` en una llamada suelta pisa lo que decide el componente, y es
 * invisible para cualquier prueba que solo mire `buttonVariants`.
 *
 * Si hace falta una medida nueva, se añade un `size` en button.tsx. Escribirla
 * en la llamada es lo que dejó cuatro alturas conviviendo en una misma barra.
 */
function fuentes(dir: string): string[] {
  return readdirSync(dir).flatMap((nombre) => {
    const ruta = join(dir, nombre);
    if (statSync(ruta).isDirectory()) return fuentes(ruta);
    return ruta.endsWith('.tsx') ? [ruta] : [];
  });
}

/** Las clases que NO puede fijar una llamada: son del tamaño del botón. */
const PROHIBIDAS = /\b(h-\d|h-\[|size-\d|size-\[|py-\d|py-\[|rounded(-[a-z0-9[]|\b))/;

/**
 * `flex-1` tampoco, y es un caso aparte del alto.
 *
 * No rompe la altura: rompe la JERARQUÍA. Los tres pies de modal que había lo
 * llevaban en los dos botones, así que se repartían el ancho a medias; en la
 * ficha del movimiento, que llega a 1024px, cada uno medía 480 y «Cancelar»
 * pesaba exactamente lo mismo que «Registrar». Un botón del tamaño de su texto
 * dice cuál es la acción principal sin tener que gritarlo.
 *
 * `w-full` sí se permite, y no es una contradicción: estirar un botón a TODO el
 * ancho de una columna angosta —el «Iniciar sesión» de una tarjeta de 384px, o
 * un pie apilado en un teléfono— es una decisión distinta de repartirse el
 * ancho con el botón de al lado. En el primer caso no hay con quién competir.
 */
const ESTIRA = /\bflex-1\b/;

describe('Nadie le cambia el tamaño a un botón desde fuera', () => {
  const archivos = fuentes(join(import.meta.dirname, '..', '..'));

  it('encuentra los archivos del proyecto', () => {
    expect(archivos.length).toBeGreaterThan(10);
  });

  /** Las clases de cada `<Button ... >` del proyecto, con su archivo. */
  function clasesDeCadaLlamada(): { ruta: string; clases: string }[] {
    const salida: { ruta: string; clases: string }[] = [];

    for (const ruta of archivos) {
      const codigo = readFileSync(ruta, 'utf8');

      // Cada `<Button ... >`, con sus saltos de línea.
      for (const etiqueta of codigo.matchAll(/<Button\b[\s\S]*?>/g)) {
        const className = /className=(?:"([^"]*)"|\{cn\(([\s\S]*?)\)\})/.exec(etiqueta[0]);
        if (!className) continue;
        salida.push({ ruta: ruta.split('/src/')[1], clases: className[1] ?? className[2] ?? '' });
      }
    }

    return salida;
  }

  it('encuentra llamadas con className que inspeccionar', () => {
    // Sin esto, cualquier cambio en la expresión que las busca dejaría las dos
    // comprobaciones de abajo pasando en vacío.
    expect(clasesDeCadaLlamada().length).toBeGreaterThan(5);
  });

  it('ninguna llamada a <Button> trae alto, relleno vertical ni radio', () => {
    const culpables = clasesDeCadaLlamada()
      .filter(({ clases }) => PROHIBIDAS.test(clases))
      .map(({ ruta, clases }) => `${ruta}: ${clases.trim().slice(0, 80)}`);

    expect(culpables, culpables.join('\n')).toEqual([]);
  });

  it('ningún botón se reparte el ancho con el de al lado', () => {
    const culpables = clasesDeCadaLlamada()
      .filter(({ clases }) => ESTIRA.test(clases))
      .map(({ ruta, clases }) => `${ruta}: ${clases.trim().slice(0, 80)}`);

    expect(
      culpables,
      'usa PieDeModal: apila a ancho completo en el teléfono y alinea a la derecha en el escritorio',
    ).toEqual([]);
  });
});
