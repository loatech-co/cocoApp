import { ChartLine } from 'lucide-react';
import { useLayoutEffect, useRef, useState } from 'react';

import { EstadoVacio } from '@/components/estado-vacio';
import { Skeleton } from '@/components/ui/skeleton';
import { diaLargo, mesLargo } from '@/lib/fechas';
import { cn, formatCOP } from '@/lib/utils';
import type { TrendPoint } from '@coco/types';

/**
 * El comportamiento del gasto, en una línea.
 *
 * ── Línea, no barras ────────────────────────────────────────────────────────
 * Lo que interesa aquí es la TENDENCIA: si el gasto sube o baja mes a mes. La
 * línea lo dice de un vistazo; una barra obliga a comparar alturas de a pares.
 *
 * ── Por qué SVG a mano ──────────────────────────────────────────────────────
 * Una librería de gráficas pesa más que el resto de la app junta, y trae su
 * propia paleta y su propia tipografía contra las que hay que pelear.
 */
export function Tendencia({
  puntos,
  granularidad,
}: {
  puntos: TrendPoint[];
  granularidad: 'dia' | 'mes';
}) {
  const lienzo = useRef<HTMLDivElement>(null);
  const tarjeta = useRef<HTMLDivElement>(null);
  const [activo, setActivo] = useState<number | null>(null);
  /** El tamaño del lienzo en píxeles, para colocar la tarjeta sin que se salga. */
  const [caja, setCaja] = useState({ ancho: 0, alto: 0 });
  const [tamTarjeta, setTamTarjeta] = useState({ ancho: 0, alto: 0 });

  // Se mide DESPUÉS de pintar y antes de que el navegador dibuje: midiendo en
  // el render la tarjeta todavía no existe, y midiendo en un efecto normal se
  // vería un fotograma con la tarjeta en el sitio equivocado.
  useLayoutEffect(() => {
    if (!tarjeta.current) return;
    const { offsetWidth, offsetHeight } = tarjeta.current;
    setTamTarjeta((previo) =>
      previo.ancho === offsetWidth && previo.alto === offsetHeight
        ? previo
        : { ancho: offsetWidth, alto: offsetHeight },
    );
  }, [activo]);

  // Los cubos vacíos vienen a propósito de la API —un mes en blanco tiene que
  // verse plano dentro de una serie—, pero si TODOS están en cero no hay serie
  // que dibujar: una línea pegada al suelo afirma "gastaste cero", que no es lo
  // mismo que "no hay nada que mostrar".
  const vacia = puntos.every((p) => Number(p.expense) === 0 && Number(p.income) === 0);

  if (puntos.length === 0 || vacia) {
    return (
      <EstadoVacio
        className="h-full"
        Icono={ChartLine}
        titulo="Sin movimientos en este periodo"
        ayuda="Amplía el rango de fechas o quita los filtros para ver la tendencia."
      />
    );
  }

  const gastos = puntos.map((p) => Number(p.expense));
  const ingresos = puntos.map((p) => Number(p.income));
  const hayIngresos = ingresos.some((v) => v > 0);
  const techo = Math.max(...gastos, ...(hayIngresos ? ingresos : [0]), 1);

  const total = gastos.reduce((s, v) => s + v, 0);
  const promedio = total / puntos.length;
  const maximo = Math.max(...gastos);
  const pico = puntos[gastos.indexOf(maximo)];

  const etiquetas = etiquetasDelEje(puntos, granularidad);

  /** El punto más cercano al dedo o al puntero. */
  function apuntar(clientX: number): void {
    const medida = lienzo.current?.getBoundingClientRect();
    if (!medida || medida.width === 0) return;

    setCaja({ ancho: medida.width, alto: medida.height });
    const fraccion = (clientX - medida.left) / medida.width;
    const indice = Math.round(fraccion * (puntos.length - 1));
    setActivo(Math.min(puntos.length - 1, Math.max(0, indice)));
  }

  function conTeclado(e: React.KeyboardEvent): void {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    e.preventDefault();

    // Con el teclado no hay puntero, así que la medida hay que tomarla aquí.
    const medida = lienzo.current?.getBoundingClientRect();
    if (medida) setCaja({ ancho: medida.width, alto: medida.height });

    const paso = e.key === 'ArrowLeft' ? -1 : 1;
    const desde = activo ?? (paso === 1 ? -1 : puntos.length);
    setActivo(Math.min(puntos.length - 1, Math.max(0, desde + paso)));
  }

  const punto = activo === null ? null : puntos[activo];
  const x = activo === null ? 0 : equis(activo, puntos.length);

  /**
   * Dónde va la tarjeta.
   *
   * Al lado del puntero, a doce píxeles, y saltando al otro lado cuando no
   * cabe: pegada a un extremo fijo obliga a mirar a otra parte para leer el
   * dato del punto que se está señalando, y siguiendo al puntero sin más se
   * sale del gráfico en los bordes.
   */
  const sitio = ((): { left: number; top: number } => {
    const px = (x / 100) * caja.ancho;
    const py = punto ? (ye(Number(punto.expense), techo) / 42) * caja.alto : 0;
    const MARGEN = 12;

    const cabeADerecha = px + MARGEN + tamTarjeta.ancho <= caja.ancho;
    const left = cabeADerecha ? px + MARGEN : Math.max(0, px - MARGEN - tamTarjeta.ancho);
    const top = Math.min(
      Math.max(0, py - tamTarjeta.alto / 2),
      Math.max(0, caja.alto - tamTarjeta.alto),
    );

    return { left, top };
  })();

  return (
    // `h-full` y el lienzo en `flex-1`: la tarjeta la estira su vecina de al
    // lado, y una gráfica de alto fijo dejaba media tarjeta en blanco debajo.
    <div className="flex h-full flex-col gap-4">
      <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1 text-xs text-muted-foreground">
        <span>
          Promedio por {granularidad === 'dia' ? 'día' : 'mes'}{' '}
          <strong className="tabular font-semibold text-foreground">{formatCOP(promedio)}</strong>
        </span>
        <span>
          Pico <strong className="tabular font-semibold text-foreground">{formatCOP(maximo)}</strong>{' '}
          en {etiquetaDeCubo(pico.bucket)}
        </span>
      </div>

      {/*
        El lienzo y lo que se superpone comparten el mismo sistema de
        coordenadas: 0–100 a lo ancho. Por eso la guía, el punto y la tarjeta
        se colocan en HTML con `left: x%` en vez de dibujarse dentro del SVG —
        el SVG se estira sin conservar la proporción, y ahí dentro un círculo
        saldría aplastado y un texto deformado.
      */}
      <div
        ref={lienzo}
        // `min-h-0` deja que el flex lo encoja; sin eso el hijo impone su alto
        // mínimo y el contenedor se desborda.
        className="relative min-h-40 min-w-0 flex-1 touch-pan-y outline-none"
        tabIndex={0}
        role="application"
        aria-label={`Gasto por ${granularidad === 'dia' ? 'día' : 'mes'}. Usa las flechas para recorrer los puntos.`}
        onPointerDown={(e) => apuntar(e.clientX)}
        onPointerMove={(e) => apuntar(e.clientX)}
        onPointerLeave={() => setActivo(null)}
        onKeyDown={conTeclado}
        onBlur={() => setActivo(null)}
      >
        <svg
          viewBox="0 0 100 42"
          preserveAspectRatio="none"
          className="h-full w-full"
          role="img"
          aria-label={`Gasto por ${granularidad === 'dia' ? 'día' : 'mes'}, de ${etiquetaDeCubo(puntos[0].bucket)} a ${etiquetaDeCubo(puntos[puntos.length - 1].bucket)}. Promedio ${formatCOP(promedio)}, pico ${formatCOP(maximo)}.`}
        >
          <defs>
            <linearGradient id="tendencia-relleno" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--color-chart-1)" stopOpacity="0.25" />
              <stop offset="100%" stopColor="var(--color-chart-1)" stopOpacity="0.02" />
            </linearGradient>
          </defs>

          {/* Tres guías: sin ellas no se puede comparar la altura de un punto
              con la de otro que esté lejos. */}
          {[0.25, 0.5, 0.75].map((f) => (
            <line
              key={f}
              x1="0"
              x2="100"
              y1={42 * f}
              y2={42 * f}
              stroke="var(--color-border)"
              strokeWidth="0.25"
              vectorEffect="non-scaling-stroke"
            />
          ))}

          <path d={area(gastos, techo, puntos.length)} fill="url(#tendencia-relleno)" />
          <path
            d={linea(gastos, techo, puntos.length)}
            fill="none"
            stroke="var(--color-chart-1)"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />

          {hayIngresos && (
            <path
              d={linea(ingresos, techo, puntos.length)}
              fill="none"
              stroke="var(--color-chart-2)"
              strokeWidth="1.75"
              strokeDasharray="4 3"
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
            />
          )}
        </svg>

        {punto && (
          <>
            <span
              aria-hidden="true"
              className="pointer-events-none absolute inset-y-0 w-px bg-border"
              style={{ left: `${x}%` }}
            />
            <Punto x={x} valor={Number(punto.expense)} techo={techo} color="var(--color-chart-1)" />
            {hayIngresos && Number(punto.income) > 0 && (
              <Punto x={x} valor={Number(punto.income)} techo={techo} color="var(--color-chart-2)" />
            )}

            {/*
              La tarjeta salta al lado CONTRARIO del puntero en vez de seguirlo.
              Siguiéndolo se saldría del gráfico en los extremos, y taparía
              justo el punto que se está mirando.
            */}
            <div
              ref={tarjeta}
              style={{ left: `${sitio.left}px`, top: `${sitio.top}px` }}
              className={cn(
                'pointer-events-none absolute min-w-36 rounded-xl bg-popover p-3',
                'shadow-[var(--sombra-flotante)] ring-1 ring-black/5 dark:ring-white/12',
                // Sin medir todavía se pinta invisible: un primer fotograma en
                // la esquina y otro en su sitio se ve como un salto.
                tamTarjeta.ancho === 0 && 'opacity-0',
              )}
            >
              <p className="text-xs font-semibold text-muted-foreground">
                {fechaLarga(punto.bucket)}
              </p>
              <p className="tabular mt-1 font-display text-base font-semibold">
                {formatCOP(Number(punto.expense))}
              </p>
              {hayIngresos && Number(punto.income) > 0 && (
                <p className="tabular mt-0.5 text-xs" style={{ color: 'var(--color-chart-2)' }}>
                  {formatCOP(Number(punto.income))} de ingreso
                </p>
              )}
              <p className="mt-1 text-[11px] text-muted-foreground">
                {punto.count} {punto.count === 1 ? 'movimiento' : 'movimientos'}
              </p>
            </div>
          </>
        )}
      </div>

      {/* El eje. Las etiquetas se COLOCAN por su posición, no se reparten en
          columnas iguales: repartidas, treinta días dejan once píxeles por
          etiqueta y los números se pisan unos con otros. */}
      <div className="relative h-4">
        {etiquetas.map(({ indice, texto }) => (
          <span
            key={indice}
            className="absolute -translate-x-1/2 whitespace-nowrap text-[11px] text-muted-foreground"
            style={{ left: `${equis(indice, puntos.length)}%` }}
          >
            {texto}
          </span>
        ))}
      </div>

    </div>
  );
}

/**
 * La gráfica mientras llega su dato.
 *
 * Con la misma forma que la gráfica de verdad: cabecera, lienzo que se estira
 * y fila de etiquetas. Un esqueleto de otro tamaño hace que la página dé un
 * salto justo cuando llegan los datos, que es el momento en que alguien está a
 * punto de pulsar algo.
 */
export function TendenciaEsqueleto() {
  return (
    <div className="flex h-full flex-col gap-4">
      <div className="flex gap-6">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-4 w-32" />
      </div>
      <Skeleton className="min-h-40 w-full flex-1 rounded-xl" />
      <div className="flex justify-between">
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i} className="h-3 w-8" />
        ))}
      </div>
      <Skeleton className="h-3 w-24" />
    </div>
  );
}

/** El punto resaltado sobre la línea. */
function Punto({
  x,
  valor,
  techo,
  color,
}: {
  x: number;
  valor: number;
  techo: number;
  color: string;
}) {
  return (
    <span
      aria-hidden="true"
      className="pointer-events-none absolute size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-card"
      style={{ left: `${x}%`, top: `${(ye(valor, techo) / 42) * 100}%`, backgroundColor: color }}
    />
  );
}

/** Coordenada X de un punto en el lienzo de 0–100. */
function equis(i: number, total: number): number {
  return total === 1 ? 50 : (i / (total - 1)) * 100;
}

/** Coordenada Y: se invierte porque en SVG el 0 está arriba. */
function ye(valor: number, techo: number): number {
  return 42 - (valor / techo) * 42;
}

function linea(serie: number[], techo: number, total: number): string {
  return serie
    .map((v, i) => `${i === 0 ? 'M' : 'L'} ${equis(i, total).toFixed(2)} ${ye(v, techo).toFixed(2)}`)
    .join(' ');
}

/** La misma línea, cerrada contra la base, para el relleno. */
function area(serie: number[], techo: number, total: number): string {
  return `${linea(serie, techo, total)} L ${equis(total - 1, total).toFixed(2)} 42 L ${equis(0, total).toFixed(2)} 42 Z`;
}


const MESES = [
  'ene', 'feb', 'mar', 'abr', 'may', 'jun',
  'jul', 'ago', 'sep', 'oct', 'nov', 'dic',
];

/**
 * La fecha de un punto, entera: `6 de septiembre de 2026` o `Septiembre de
 * 2026`.
 *
 * Aquí sí cabe y aquí sí hace falta. En el eje hay decenas de fechas y el
 * nombre completo las haría chocar; en la tarjeta hay UNA, y "sep 26" obliga a
 * descifrar una abreviatura y a adivinar si el 26 es el día o el año.
 */
export function fechaLarga(bucket: string): string {
  return bucket.length > 7 ? diaLargo(bucket) : mesLargo(bucket);
}

/** El último día de un mes: 28, 29, 30 o 31 según cuál sea. */
function ultimoDia(anio: number, mes: number): number {
  return new Date(Date.UTC(anio, mes, 0)).getUTCDate();
}

/**
 * Qué puntos del eje llevan etiqueta, y qué dice cada una.
 *
 * ── Menos de tres meses: cada cinco días ────────────────────────────────────
 * 5, 10, 15, 20, 25 y el último del mes —28, 29, 30 o 31, según cuál sea—. El
 * 30 solo aparece cuando de verdad cierra el mes: en un mes de 31 días sería
 * una etiqueta pegada a la siguiente.
 *
 * No se habla de "semanas" porque las semanas no coinciden con los meses: la
 * semana 5 empieza un martes en marzo y un viernes en abril, y comparar dos
 * meses dejaría de ser posible.
 *
 * El NOMBRE DEL MES se escribe solo la primera vez que aparece. Sin él, un
 * rango de dos meses muestra "5 10 15 20 25 31 5 10 15 20 25 30" y no hay
 * forma de saber dónde termina uno y empieza el otro.
 *
 * ── Tres meses o más: solo el mes ───────────────────────────────────────────
 * "Ene Feb Mar", sin día. Todas con la misma forma: si el rango cruza de año
 * lo llevan todas, y si no lo cruza no lo lleva ninguna. Escribirlo solo donde
 * cambia dejaba un eje que mezclaba "ene" con "abr 23" y se leía como si
 * fueran dos cosas distintas.
 *
 * Y si son tantos meses que no caben, uno de cada tantos. Cincuenta etiquetas
 * en un teléfono no se leen: se tocan.
 */
export function etiquetasDelEje(
  puntos: readonly { bucket: string }[],
  granularidad: 'dia' | 'mes',
): { indice: number; texto: string }[] {
  if (granularidad === 'mes') {
    const cada = Math.max(1, Math.ceil(puntos.length / 12));

    // Todas las etiquetas con la MISMA forma. Escribir el año solo donde
    // cambia deja un eje que mezcla "ene" con "abr 23" y se lee como si
    // fueran dos cosas distintas. Si el rango cruza de año, el año va en
    // todas; si no cruza, en ninguna.
    const cruzaDeAnio = new Set(puntos.map((p) => p.bucket.slice(0, 4))).size > 1;

    return puntos
      .map((p, indice) => ({ indice, bucket: p.bucket }))
      .filter(({ indice }) => indice % cada === 0)
      .map(({ indice, bucket }) => {
        const [anio, mes] = bucket.split('-');
        const nombre = MESES[Number(mes) - 1] ?? mes;
        const conMayuscula = nombre.charAt(0).toUpperCase() + nombre.slice(1);
        return {
          indice,
          texto: cruzaDeAnio ? `${conMayuscula} ${anio.slice(2)}` : conMayuscula,
        };
      });
  }

  const etiquetas: { indice: number; texto: string }[] = [];
  let mesEscrito = '';

  puntos.forEach((p, indice) => {
    const [anio, mes, dia] = p.bucket.split('-').map(Number);
    const esUltimo = dia === ultimoDia(anio, mes);
    // 5, 10, 15, 20 y 25. El 30 queda fuera: o cierra el mes —y entra por la
    // otra condición— o está a un día del 31, que sí lo cierra.
    const esQuinto = dia % 5 === 0 && dia < 26;
    if (!esQuinto && !esUltimo) return;

    const clave = p.bucket.slice(0, 7);
    const texto = clave === mesEscrito ? String(dia) : `${dia} ${MESES[mes - 1] ?? mes}`;
    mesEscrito = clave;

    etiquetas.push({ indice, texto });
  });

  return etiquetas;
}

/**
 * `2025-03-14` → `14 mar`. `2025-03` → `mar 25`, o solo `mar` si todo el rango
 * cae en el mismo año.
 *
 * Repetir el año en los doce puntos de un mismo año es ruido: ocupa espacio,
 * hace que las etiquetas se pisen y no distingue un punto de otro. Solo aporta
 * cuando el rango cruza de año.
 */
export function etiquetaDeCubo(bucket: string, mismoAnio = false): string {
  const [anio, mes, dia] = bucket.split('-');
  const nombre = MESES[Number(mes) - 1] ?? mes;
  if (dia) return `${Number(dia)} ${nombre}`;
  return mismoAnio ? nombre : `${nombre} ${anio.slice(2)}`;
}
