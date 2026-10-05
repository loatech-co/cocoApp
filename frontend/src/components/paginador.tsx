import { ArrowLeft, ArrowRight } from 'lucide-react';

import { cn } from '@/lib/utils';

/**
 * Paginador. Uno solo para toda la app.
 *
 * Existe como componente y no suelto en cada pantalla porque las reglas de
 * borde —deshabilitar en los extremos, no mostrarse con una sola página,
 * qué números caben— se olvidan la mitad de las veces si hay que reescribirlas.
 *
 * ── Por qué los números y no solo "anterior / siguiente" ────────────────────
 * Porque con ocho páginas uno quiere saltar a la cinco, no pulsar tres veces.
 * Y porque el número encendido dice dónde está uno sin tener que leer un
 * contador aparte.
 *
 * ── Por qué es un grupo pegado y no botones sueltos ─────────────────────────
 * Un solo borde alrededor de todo lo presenta como UN control: los botones
 * sueltos con espacio entre ellos se leen como acciones distintas, y "3" no es
 * una acción distinta de "4".
 */
export function Paginador({
  pagina,
  total,
  porPagina,
  onCambiar,
  className,
}: {
  pagina: number;
  /** Total de FILAS, no de páginas: es lo que devuelve la API. */
  total: number;
  porPagina: number;
  onCambiar: (pagina: number) => void;
  className?: string;
}) {
  const paginas = Math.max(1, Math.ceil(total / porPagina));

  // Con una sola página no hay nada que paginar, y mostrar dos botones muertos
  // solo añade ruido.
  if (paginas <= 1) return null;

  return (
    <nav className={cn('flex justify-center', className)} aria-label="Paginación">
      {/*
        Sin relleno propio: el paginador se apoya en el fondo de la página en
        vez de flotar sobre él. Con `bg-card` se leía como una tarjeta más —del
        mismo color que las que tienen contenido— y competía por atención con
        la tabla que acaba de terminar de leerse.

        Se queda el marco, fino y tenue, porque es lo que lo presenta como UN
        control y no como siete botones sueltos.
      */}
      <ul className="inline-flex items-stretch divide-x divide-border/70 overflow-hidden rounded-lg border border-border/70">
        <li>
          <Celda
            deshabilitada={pagina <= 1}
            onClick={() => onCambiar(pagina - 1)}
            aria-label="Página anterior"
          >
            <ArrowLeft className="size-4" aria-hidden="true" />
            <span className="hidden sm:inline">Anterior</span>
          </Celda>
        </li>

        {numerosVisibles(pagina, paginas).map((n, i) =>
          n === null ? (
            <li key={`salto-${i}`}>
              <span className="grid h-9 w-9 place-items-center text-sm text-muted-foreground">
                …
              </span>
            </li>
          ) : (
            <li key={n}>
              <Celda
                actual={n === pagina}
                onClick={() => onCambiar(n)}
                aria-label={`Página ${n}`}
                aria-current={n === pagina ? 'page' : undefined}
              >
                <span className="tabular w-4 text-center">{n}</span>
              </Celda>
            </li>
          ),
        )}

        <li>
          <Celda
            deshabilitada={pagina >= paginas}
            onClick={() => onCambiar(pagina + 1)}
            aria-label="Página siguiente"
          >
            <span className="hidden sm:inline">Siguiente</span>
            <ArrowRight className="size-4" aria-hidden="true" />
          </Celda>
        </li>
      </ul>
    </nav>
  );
}

function Celda({
  children,
  actual = false,
  deshabilitada = false,
  onClick,
  ...props
}: {
  children: React.ReactNode;
  actual?: boolean;
  deshabilitada?: boolean;
  onClick: () => void;
} & React.ComponentProps<'button'>) {
  return (
    <button
      type="button"
      disabled={deshabilitada}
      onClick={onClick}
      className={cn(
        'flex h-9 items-center justify-center gap-2 px-3 text-sm font-medium transition-colors',
        actual
          ? 'bg-muted/70 text-foreground'
          : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground',
        deshabilitada && 'cursor-not-allowed opacity-40 hover:bg-transparent',
      )}
      {...props}
    >
      {children}
    </button>
  );
}

/**
 * Qué números se dibujan. `null` es un salto (…).
 *
 * Con cincuenta páginas no caben cincuenta botones, así que se muestran los
 * extremos, la actual y sus vecinas. Los extremos siempre: son los dos saltos
 * que uno quiere dar —al principio y al final— y sin ellos hay que pulsar
 * "siguiente" cuarenta veces.
 */
export function numerosVisibles(pagina: number, paginas: number, hueco = 1): (number | null)[] {
  if (paginas <= 7) return Array.from({ length: paginas }, (_, i) => i + 1);

  const cerca = new Set<number>([1, paginas, pagina]);
  for (let d = 1; d <= hueco; d += 1) {
    if (pagina - d > 1) cerca.add(pagina - d);
    if (pagina + d < paginas) cerca.add(pagina + d);
  }

  const orden = [...cerca].sort((a, b) => a - b);
  const salida: (number | null)[] = [];

  let anterior: number | undefined;
  for (const actual of orden) {
    // Un salto de UN número no se dibuja con puntos: "1 … 3" ocupa lo mismo
    // que "1 2 3" y esconde una página por nada.
    if (anterior !== undefined && actual - anterior > 1) {
      salida.push(actual - anterior === 2 ? actual - 1 : null);
    }
    salida.push(actual);
    anterior = actual;
  }

  return salida;
}
