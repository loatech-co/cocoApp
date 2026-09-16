import { useState } from 'react';

import { cn, formatCOP } from '@/lib/utils';

/**
 * Los colores de las porciones. Viven en `index.css` porque cambian con el
 * tema: en claro la primera es bosque oscuro, en oscuro tiene que ser clara o
 * la porción se confunde con la tarjeta y la dona parece vacía.
 */
const PALETA = [
  { fondo: 'var(--dona-1)', tinta: 'var(--dona-1-tinta)' },
  { fondo: 'var(--dona-2)', tinta: 'var(--dona-2-tinta)' },
  { fondo: 'var(--dona-3)', tinta: 'var(--dona-3-tinta)' },
  { fondo: 'var(--dona-4)', tinta: 'var(--dona-4-tinta)' },
  { fondo: 'var(--dona-5)', tinta: 'var(--dona-5-tinta)' },
];
const OTROS = { fondo: 'var(--dona-otros)', tinta: 'var(--dona-otros-tinta)' };

/* ── Geometría ──────────────────────────────────────────────────────────────
   Un lienzo ancho y bajo: la dona en el centro y los nombres a los lados, que
   es donde hay sitio. Apilados debajo serían otra vez una leyenda.            */
const ANCHO = 320;
const ALTO = 180;
const CX = ANCHO / 2;
const CY = ALTO / 2;
const RADIO = 50;
const GROSOR = 26;
const VUELTA = 2 * Math.PI * RADIO;

/** Dónde dobla la línea guía y dónde empieza el texto. */
const CODO = RADIO + GROSOR / 2 + 10;
const MARGEN_TEXTO = 8;
/** Separación mínima entre dos nombres del mismo lado. */
const ALTO_DE_NOMBRE = 34;

/** Por debajo de esto la cifra no cabe dentro de su porción. */
const MINIMO_PARA_CIFRA = 0.06;

export interface PorcionDeDona {
  id: number | null;
  nombre: string;
  valor: number;
}

/**
 * Una dona con los nombres alrededor.
 *
 * ── Por qué la cifra va DENTRO y el nombre FUERA ────────────────────────────
 * Porque son dos lecturas distintas. El porcentaje se compara de un vistazo
 * entre porciones, y para eso tiene que estar sobre el color que mide. El
 * nombre se lee una vez, y dentro del aro no cabría sin encogerlo hasta que
 * deje de leerse.
 *
 * ── Por qué una línea guía y no una leyenda ─────────────────────────────────
 * Una leyenda obliga a emparejar colores a ojo: se lee el nombre, se memoriza
 * su cuadrito y se busca esa misma tinta en el aro. La línea ya hizo ese
 * trabajo. Además una leyenda crece hacia abajo y empuja el resto de la
 * tarjeta; los nombres a los lados ocupan sitio que de otro modo estaría
 * vacío.
 */
export function Dona({
  porciones,
  total,
  maximo = 5,
  onElegir,
  className,
}: {
  porciones: PorcionDeDona[];
  /** El total del recorte. No se dibuja: manda sobre la suma de las porciones. */
  total: number;
  maximo?: number;
  onElegir?: (id: number) => void;
  className?: string;
}) {
  const [activa, setActiva] = useState<number | null>(null);

  const ordenadas = [...porciones].sort((a, b) => b.valor - a.valor);
  const visibles = ordenadas.slice(0, maximo);
  const cola = ordenadas.slice(maximo);
  const sumaCola = cola.reduce((s, p) => s + p.valor, 0);

  const segmentos = [
    ...visibles.map((p, i) => ({ ...p, ...PALETA[i % PALETA.length] })),
    ...(sumaCola > 0
      ? [{ id: null, nombre: `Otros (${cola.length})`, valor: sumaCola, ...OTROS }]
      : []),
  ];

  // El total manda sobre la suma: si hay gasto sin clasificar, el aro queda con
  // un hueco en vez de repartirlo entre las demás porciones.
  const base = total > 0 ? total : segmentos.reduce((s, p) => s + p.valor, 0) || 1;

  let recorrido = 0;
  const trazos = segmentos.map((seg) => {
    const fraccion = seg.valor / base;
    const medio = recorrido + fraccion / 2;
    const inicio = recorrido;
    recorrido += fraccion;

    // −90° porque el aro empieza ARRIBA, no a las tres en punto: es donde uno
    // empieza a leer un reloj y también una dona.
    const angulo = medio * 2 * Math.PI - Math.PI / 2;
    const derecha = Math.cos(angulo) >= 0;

    return {
      ...seg,
      fraccion,
      largo: fraccion * VUELTA,
      desfase: -inicio * VUELTA,
      derecha,
      cifra: {
        x: CX + Math.cos(angulo) * RADIO,
        y: CY + Math.sin(angulo) * RADIO,
      },
      codo: {
        x: CX + Math.cos(angulo) * CODO,
        y: CY + Math.sin(angulo) * CODO,
      },
    };
  });

  // Los nombres de un mismo lado se separan para que no se pisen: dos porciones
  // vecinas apuntan casi al mismo alto y sus textos se montarían.
  for (const lado of [true, false]) {
    const enEsteLado = trazos.filter((t) => t.derecha === lado).sort((a, b) => a.codo.y - b.codo.y);
    for (let i = 1; i < enEsteLado.length; i += 1) {
      const anterior = enEsteLado[i - 1];
      const actual = enEsteLado[i];
      if (actual.codo.y - anterior.codo.y < ALTO_DE_NOMBRE) {
        actual.codo.y = anterior.codo.y + ALTO_DE_NOMBRE;
      }
    }
  }

  const pct = (v: number, total: number): string => `${(v / total) * 100}%`;

  return (
    /*
      El dibujo va en SVG y TODO el texto en HTML encima.
      ── Por qué ──────────────────────────────────────────────────────────────
      El SVG se estira para llenar la tarjeta, y con él se estira lo que lleve
      dentro: un `font-size: 11px` escrito en un lienzo de 320 unidades se
      dibuja a 22px cuando la tarjeta mide 640. El texto en HTML no se entera
      de esa escala y mide siempre lo que dice que mide. De paso, cortar un
      nombre largo pasa a ser un `truncate` de CSS en vez de contar letras.
    */
    <div className={cn('relative w-full', className)}>
      <svg
        viewBox={`0 0 ${ANCHO} ${ALTO}`}
        className="w-full"
        role="img"
        aria-label="Distribución del gasto"
      >
        {/* El aro de fondo: es lo que se ve donde no llega ninguna porción. */}
        <circle
          cx={CX}
          cy={CY}
          r={RADIO}
          fill="none"
          stroke="var(--color-secondary)"
          strokeWidth={GROSOR}
        />

        {trazos.map((seg, i) => {
          const puedeBajar = seg.id !== null && onElegir !== undefined;
          const finX = seg.derecha ? ANCHO - MARGEN_TEXTO : MARGEN_TEXTO;

          return (
            <g
              key={seg.id ?? seg.nombre}
              onPointerEnter={() => setActiva(i)}
              onPointerLeave={() => setActiva(null)}
              onClick={() => puedeBajar && onElegir(seg.id as number)}
              className={cn(
                'transition-opacity',
                puedeBajar && 'cursor-pointer',
                activa !== null && activa !== i && 'opacity-35',
              )}
            >
              <circle
                cx={CX}
                cy={CY}
                r={RADIO}
                fill="none"
                stroke={seg.fondo}
                strokeWidth={GROSOR}
                strokeDasharray={`${seg.largo} ${VUELTA - seg.largo}`}
                strokeDashoffset={seg.desfase}
                transform={`rotate(-90 ${CX} ${CY})`}
              />

              {/* La guía: del borde del aro al codo, y del codo al texto. */}
              <polyline
                points={`${seg.codo.x},${seg.codo.y} ${seg.derecha ? seg.codo.x + 12 : seg.codo.x - 12},${seg.codo.y} ${seg.derecha ? finX - 2 : finX + 2},${seg.codo.y}`}
                fill="none"
                stroke={seg.fondo}
                strokeWidth="1.5"
                strokeLinecap="round"
                vectorEffect="non-scaling-stroke"
              />
              <circle cx={seg.codo.x} cy={seg.codo.y} r="2.5" fill={seg.fondo} />
            </g>
          );
        })}
      </svg>

      {/* La cifra, SOBRE el color que mide, con la tinta que ese color admite:
          blanco sobre lima da 1.23:1 y no se lee. */}
      {trazos.map((seg, i) =>
        seg.fraccion >= MINIMO_PARA_CIFRA ? (
          <span
            key={`c-${seg.id ?? seg.nombre}`}
            aria-hidden="true"
            style={{
              left: pct(seg.cifra.x, ANCHO),
              top: pct(seg.cifra.y, ALTO),
              color: seg.tinta,
            }}
            className={cn(
              'pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 text-[15px] font-semibold transition-opacity',
              activa !== null && activa !== i && 'opacity-35',
            )}
          >
            {Math.round(seg.fraccion * 100)}%
          </span>
        ) : null,
      )}

      {/* El nombre y el valor, al final de su línea guía. */}
      {trazos.map((seg, i) => {
        const puedeBajar = seg.id !== null && onElegir !== undefined;

        return (
          <button
            key={`n-${seg.id ?? seg.nombre}`}
            type="button"
            disabled={!puedeBajar}
            onPointerEnter={() => setActiva(i)}
            onPointerLeave={() => setActiva(null)}
            onClick={() => puedeBajar && onElegir(seg.id as number)}
            style={{
              top: pct(seg.codo.y, ALTO),
              [seg.derecha ? 'right' : 'left']: pct(MARGEN_TEXTO, ANCHO),
              maxWidth: '38%',
            }}
            className={cn(
              'absolute -translate-y-1/2 rounded text-left transition-opacity',
              seg.derecha ? 'text-right' : 'text-left',
              puedeBajar ? 'cursor-pointer hover:opacity-80' : 'cursor-default',
              activa !== null && activa !== i && 'opacity-35',
            )}
          >
            <span className="block truncate text-[15px] font-semibold leading-tight text-foreground">
              {seg.nombre}
            </span>
            <span className="tabular block truncate text-[14px] leading-tight text-muted-foreground">
              {formatCOP(seg.valor)}
            </span>
          </button>
        );
      })}
    </div>
  );
}
