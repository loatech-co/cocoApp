import { Card, CardContent } from '@/components/ui/card';
import { diaCorto } from '@/lib/fechas';
import { cn, formatCOP } from '@/lib/utils';
import type { PagoPendiente } from '@coco/types';

/** Hoy en America/Bogota, para saber qué ya venció. */
function hoy(): string {
  return new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

/**
 * Lo que falta pagar este mes.
 *
 * ── Por qué son los conceptos y no movimientos ──────────────────────────────
 * Porque un pago pendiente es, por definición, un movimiento que NO EXISTE. Se
 * deduce de los conceptos marcados como recurrentes: si toca este mes y no hay
 * ningún movimiento suyo en el periodo, falta.
 *
 * ── Por qué del mes en curso y no del rango de arriba ───────────────────────
 * Porque "¿qué me falta pagar?" es siempre una pregunta sobre hoy. Revisar
 * 2024 no cambia lo que hay que pagar esta semana.
 */
export function PagosPendientes({
  pagos,
  onElegir,
  className,
}: {
  pagos: PagoPendiente[];
  /** Registrar el pago: abre el modal con el concepto puesto. */
  onElegir?: (pago: PagoPendiente) => void;
  className?: string;
}) {
  const ahora = hoy();
  const total = pagos.reduce((s, p) => s + Number(p.expected_amount ?? 0), 0);

  /*
    Sin pendientes no hay tarjeta.

    Vacía no dice "todo al día": dice "aquí hay una sección", y ocupa un tercio
    de la fila para decirlo. En un periodo cerrado no puede quedar nada
    —ya pasó— y en el mes en curso, con todo pagado, la buena noticia es que
    la tarjeta no esté.

    Se decide también aquí y no solo en el resumen: la rejilla de allá necesita
    saberlo para repartir las columnas, pero un componente que se pinta vacío
    cuando lo llaman sin datos es una trampa esperando a la segunda pantalla
    que lo use.
  */
  if (pagos.length === 0) return null;

  return (
    <Card className={cn('h-full', className)}>
      <CardContent className="flex h-full flex-col p-4 sm:p-6">
        <h2 className="font-display text-lg font-semibold">Pagos pendientes</h2>
        <p className="truncate text-xs text-muted-foreground">
          {total > 0 ? `Unos ${formatCOP(total)} este mes` : 'Este mes'}
        </p>

        {/* Se desplaza en vez de crecer: la tarjeta comparte fila con la
             gráfica y la dona, y una lista larga estiraría a las tres.

             El par `-mr-3 pr-4` es para la barra de desplazamiento. En macOS
             la barra FLOTA encima del contenido en vez de ocupar sitio, así
             que no basta con que la lista quepa: hay que dejarle aire propio.
             La lista se sale 12px sobre el relleno de la tarjeta —ahí va la
             barra— y el texto se queda a 20px de ese borde, que es la barra
             más un margen. Con los 8px que había antes, la barra caía justo
             sobre la cifra. */}
        <ul className="-mr-3 mt-4 flex min-h-0 flex-1 flex-col divide-y divide-border overflow-y-auto pr-5">
          {pagos.map((pago) => {
              const vencido = pago.due_date < ahora;

              return (
                <li key={pago.category_id}>
                  <button
                    type="button"
                    disabled={!onElegir}
                    onClick={() => onElegir?.(pago)}
                    className={cn(
                      'flex w-full items-center justify-between gap-3 py-2.5 text-left transition-opacity',
                      onElegir ? 'cursor-pointer hover:opacity-70' : 'cursor-default',
                    )}
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium">{pago.name}</span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {pago.path}
                      </span>
                    </span>

                    <span className="shrink-0 text-right">
                      {pago.expected_amount && (
                        <span className="tabular block text-sm font-semibold">
                          {formatCOP(pago.expected_amount)}
                        </span>
                      )}
                      {/* Vencido en ámbar, no en rojo: se debe, no salió mal.
                          El rojo está reservado a los errores. */}
                      <span
                        className={cn(
                          'block text-xs',
                          vencido ? 'font-medium text-warning' : 'text-muted-foreground',
                        )}
                      >
                        {diaCorto(pago.due_date)}
                      </span>
                    </span>
                  </button>
                </li>
              );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}
