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

/**
 * Dónde termina una etiqueta `<Button …>`.
 *
 * ── Por qué no vale una expresión regular ───────────────────────────────────
 * Estaba `\/<Button\\b[\\s\\S]*?>\/`, que corta en el primer `>`. Y en JSX el primer
 * `>` de una etiqueta casi nunca es el suyo: es el de la flecha de un
 * `onClick={() => …}`. Así que la prueba capturaba «<Button type="button"
 * onClick={() =>», no encontraba ningún `className` dentro, y se saltaba esa
 * llamada EN SILENCIO.
 *
 * Como la mayoría de los botones de esta app llevan una flecha antes de su
 * `className`, lo que en realidad se estaba comprobando era una minoría. Es el
 * mismo fallo que tenía la lista de tamaños de la prueba de al lado: una
 * comprobación que no mide lo que dice medir no avisa de nada.
 *
 * Así que se cuentan las llaves. Dentro de `{…}` va JavaScript —con sus
 * flechas, sus objetos y sus cadenas— y el `>` que cierra la etiqueta es el
 * primero que aparece con el contador a cero.
 */
function finDeLaEtiqueta(codigo: string, desde: number): number {
  let llaves = 0;
  let comilla: string | null = null;

  for (let i = desde; i < codigo.length; i += 1) {
    const c = codigo[i];

    if (comilla !== null) {
      if (c === comilla && codigo[i - 1] !== '\\') comilla = null;
      continue;
    }

    if (c === '"' || c === "'" || c === '`') comilla = c;
    else if (c === '{') llaves += 1;
    else if (c === '}') llaves -= 1;
    else if (c === '>' && llaves === 0) return i;
  }

  return codigo.length;
}

describe('Nadie le cambia el tamaño a un botón desde fuera (continuación)', () => {
  it('se puede localizar el final de una etiqueta con una flecha dentro', () => {
    // El caso exacto que se colaba.
    const codigo = '<Button onClick={() => x()} className="a">';
    expect(codigo.slice(0, finDeLaEtiqueta(codigo, 0) + 1)).toContain('className');
  });
});

describe('Nadie le cambia el tamaño a un botón desde fuera', () => {
  const archivos = fuentes(join(import.meta.dirname, '..', '..'));

  /** Las clases de cada `<Button … >` del proyecto, con su archivo. */
  function clasesDeCadaLlamada(): { ruta: string; clases: string }[] {
    const salida: { ruta: string; clases: string }[] = [];

    for (const ruta of archivos) {
      const codigo = readFileSync(ruta, 'utf8');

      for (const apertura of codigo.matchAll(/<Button\b/g)) {
        const etiqueta = codigo.slice(apertura.index, finDeLaEtiqueta(codigo, apertura.index) + 1);
        const className = /className=(?:"([^"]*)"|\{cn\(([\s\S]*?)\)\})/.exec(etiqueta);
        if (!className) continue;
        salida.push({ ruta: ruta.split('/src/')[1], clases: className[1] ?? className[2] ?? '' });
      }
    }

    return salida;
  }

  it('encuentra los archivos del proyecto', () => {
    expect(archivos.length).toBeGreaterThan(10);
  });

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
