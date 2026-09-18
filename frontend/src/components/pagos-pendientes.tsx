import { Filter, FilterX } from 'lucide-react';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
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
  /**
   * Confirmar el pago: abre la ficha de un movimiento nuevo con el concepto,
   * el valor esperado y la fecha de vencimiento ya puestos. Se le pasa el pago
   * ENTERO y no su concepto: los otros dos datos están aquí, y pedirlos otra
   * vez sería teclear mirando esta misma fila.
   */
  onElegir?: (pago: PagoPendiente) => void;
  className?: string;
}) {
  const ahora = hoy();

  /*
    ── Los variables se pueden apagar ────────────────────────────────────────
    Una suscripción se cobra sola y cuesta lo mismo todos los meses: no hay
    nada que decidir con ella, y diez de esas empujan fuera de la vista lo que
    sí hay que mirar —el recibo de la luz que llegó con recargo, el seguro que
    vence el martes—.

    Se apagan, no se quitan: el día que uno quiera comprobar que se cobraron,
    están a un toque. Y el interruptor NO se recuerda entre visitas, a
    propósito: es una forma de mirar esta lista ahora, no una preferencia, y un
    filtro guardado que esconde plata es de los que se olvidan puestos.
  */
  const [sinVariables, setSinVariables] = useState(false);
  const hayVariables = pagos.some((p) => !p.estatico);
  const visibles = sinVariables ? pagos.filter((p) => p.estatico) : pagos;

  // El total es el de lo que SE VE. Con la suma de todo bajo una lista
  // recortada, la cifra contradice lo que hay debajo y no hay forma de saber
  // cuál de las dos miente.
  const total = visibles.reduce((s, p) => s + Number(p.expected_amount ?? 0), 0);

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
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-display text-lg font-semibold">Pagos pendientes</h2>

          {/* Solo si hay algo que esconder: un interruptor que no cambia nada
              se pulsa una vez, no pasa nada, y se deja de creer en él.

              El mismo botón que el de la dona y los de la barra de filtros
              —variante `herramienta`, tamaño `sm-icon`—: hace lo mismo que
              ellos, recortar lo que se está viendo, y tiene que verse igual. */}
          {hayVariables && (
            <Button
              type="button"
              variant="herramienta"
              size="sm-icon"
              aria-pressed={sinVariables}
              aria-label={
                sinVariables ? 'Mostrar los costos variables' : 'Ocultar los costos variables'
              }
              title={
                sinVariables ? 'Mostrar los costos variables' : 'Ocultar los costos variables'
              }
              onClick={() => setSinVariables((v) => !v)}
            >
              {sinVariables ? (
                <FilterX className="size-4" aria-hidden="true" />
              ) : (
                <Filter className="size-4" aria-hidden="true" />
              )}
            </Button>
          )}
        </div>

        <p className="truncate text-xs text-muted-foreground">
          {total > 0 ? `Unos ${formatCOP(total)} este mes` : 'Este mes'}
          {sinVariables && ' · solo fijos'}
        </p>

        {/* Se desplaza en vez de crecer: la tarjeta comparte fila con la
             gráfica y la dona, y una lista larga estiraría a las tres.

             El par `-mr-3 pr-3` es para la barra de desplazamiento. En macOS
             la barra FLOTA encima del contenido en vez de ocupar sitio, así
             que no basta con que la lista quepa: hay que dejarle aire propio.
             La lista se sale 12px sobre el relleno de la tarjeta —ahí va la
             barra, encima del relleno y fuera de las filas— y su contenido
             termina justo en el borde interior de la tarjeta. */}
        <ul className="-mr-3 mt-4 flex min-h-0 flex-1 flex-col divide-y divide-border overflow-y-auto pr-3">
          {visibles.map((pago) => {
              const vencido = pago.due_date < ahora;

              return (
                <li
                  key={pago.category_id}
                  /*
                    Los dos divisores que TOCA la fila señalada se apagan.

                    El resaltado es un rectángulo redondeado, y una línea que
                    le entra por el canto lo parte: se lee como si la fila
                    estuviera cortada en vez de levantada. Apagando la raya de
                    arriba y la de abajo, la fila queda suelta entre las otras
                    —que es lo que está diciendo— y la lista no pierde su
                    retícula, porque las demás siguen ahí.

                    En Tailwind 4 el divisor es el borde de ABAJO del elemento
                    anterior, así que hay dos que apagar y no uno: el propio,
                    que es el de abajo, y el del que va justo antes, que es el
                    de arriba. De ahí el `:has()`.

                    Y se desvanecen en vez de desaparecer: la fila ya cambia
                    de color con una transición, y una raya que salta mientras
                    el fondo se funde se ve como un fallo de pintado.
                  */
                  className={cn(
                    'transition-colors',
                    'hover:border-b-transparent',
                    '[&:has(+li:hover)]:border-b-transparent',
                  )}
                >
                  <button
                    type="button"
                    disabled={!onElegir}
                    onClick={() => onElegir?.(pago)}
                    className={cn(
                      // El resaltado es un FONDO, no una bajada de opacidad.
                      // Atenuar el texto al pasar por encima es exactamente lo
                      // que hace un control apagado, así que la fila que sí se
                      // puede pulsar parecía la que no.
                      //
                      // Y ese fondo no se sale de la tarjeta: antes sobresalía
                      // 8px por la izquierda y quedaba a ras por la derecha, de
                      // modo que el recuadro casi tocaba el canto y el nombre y
                      // la cifra se apoyaban en su borde. Ahora ocupa el ancho
                      // de la columna —alineado con el título— y deja 12px de
                      // aire a cada lado por dentro.
                      'flex w-full items-center justify-between gap-3 rounded-md px-3 py-2.5',
                      'text-left transition-colors',
                      /*
                        El realce va en el ACENTO COMO TINTA, no en la
                        superficie de acento.

                        `accent` es un verde apagado: sobre la tarjeta de
                        pendientes, que ya es una superficie tenue, la fila
                        señalada se distinguía apenas de sus vecinas. Aquí hace
                        falta que se vea cuál se va a registrar, porque pulsarla
                        abre una ficha con plata dentro.

                        `--acento-tinta` es el mismo acento pero a plena
                        intensidad —lima en oscuro, verde oscuro en claro—, así
                        que al 10 % tiñe el fondo sin llegar a pintarlo y a
                        plena tinta destaca el nombre. Es un token, así que
                        sigue al tema: no hay ningún lima escrito a mano.
                      */
                      onElegir
                        ? 'cursor-pointer hover:bg-acento-tinta/10 hover:text-acento-tinta'
                        : 'cursor-default',
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
          {/* Apagados TODOS, la lista queda vacía y la tarjeta se quedaría sin
              nada que enseñar salvo el botón para volver. Se dice, porque un
              hueco en blanco se lee como «no hay nada pendiente», que es lo
              contrario de lo que pasa. */}
          {visibles.length === 0 && (
            <li className="py-6 text-center text-sm text-muted-foreground">
              Todo lo que queda es de costos variables.
            </li>
          )}
        </ul>
      </CardContent>
    </Card>
  );
}
