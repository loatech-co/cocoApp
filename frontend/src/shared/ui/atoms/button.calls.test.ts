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
function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sources(path);
    return path.endsWith('.tsx') ? [path] : [];
  });
}

/** Las clases que NO puede fijar una llamada: son del tamaño del botón. */
const FORBIDDEN = /\b(h-\d|h-\[|size-\d|size-\[|py-\d|py-\[|rounded(-[a-z0-9[]|\b))/;

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
const STRETCHES = /\bflex-1\b/;

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
function tagEnd(code: string, from: number): number {
  let braces = 0;
  let quote: string | null = null;

  for (let i = from; i < code.length; i += 1) {
    const c = code[i];

    if (quote !== null) {
      if (c === quote && code[i - 1] !== '\\') quote = null;
      continue;
    }

    if (c === '"' || c === "'" || c === '`') quote = c;
    else if (c === '{') braces += 1;
    else if (c === '}') braces -= 1;
    else if (c === '>' && braces === 0) return i;
  }

  return code.length;
}

describe('Nadie le cambia el tamaño a un botón desde fuera (continuación)', () => {
  it('se puede localizar el final de una etiqueta con una flecha dentro', () => {
    // El caso exacto que se colaba.
    const code = '<Button onClick={() => x()} className="a">';
    expect(code.slice(0, tagEnd(code, 0) + 1)).toContain('className');
  });
});

describe('Nadie le cambia el tamaño a un botón desde fuera', () => {
  const files = sources(join(import.meta.dirname, '..', '..', '..'));

  /** Las clases de cada `<Button … >` del proyecto, con su archivo. */
  function classesOfEachCall(): { path: string; classes: string }[] {
    const output: { path: string; classes: string }[] = [];

    for (const path of files) {
      const code = readFileSync(path, 'utf8');

      for (const opening of code.matchAll(/<Button\b/g)) {
        const tag = code.slice(opening.index, tagEnd(code, opening.index) + 1);
        const className = /className=(?:"([^"]*)"|\{cn\(([\s\S]*?)\)\})/.exec(tag);
        if (!className) continue;
        output.push({ path: path.split('/src/')[1]!, classes: className[1] ?? className[2] ?? '' });
      }
    }

    return output;
  }

  it('encuentra los archivos del proyecto', () => {
    expect(files.length).toBeGreaterThan(10);
  });

  it('encuentra llamadas con className que inspeccionar', () => {
    // Sin esto, cualquier cambio en la expresión que las busca dejaría las dos
    // comprobaciones de abajo pasando en vacío.
    expect(classesOfEachCall().length).toBeGreaterThan(5);
  });

  it('ninguna llamada a <Button> trae alto, relleno vertical ni radio', () => {
    const offenders = classesOfEachCall()
      .filter(({ classes }) => FORBIDDEN.test(classes))
      .map(({ path, classes }) => `${path}: ${classes.trim().slice(0, 80)}`);

    expect(offenders, offenders.join('\n')).toEqual([]);
  });

  it('ningún botón se reparte el ancho con el de al lado', () => {
    const offenders = classesOfEachCall()
      .filter(({ classes }) => STRETCHES.test(classes))
      .map(({ path, classes }) => `${path}: ${classes.trim().slice(0, 80)}`);

    expect(
      offenders,
      'usa PieDeModal: apila a ancho completo en el teléfono y alinea a la derecha en el escritorio',
    ).toEqual([]);
  });
});
