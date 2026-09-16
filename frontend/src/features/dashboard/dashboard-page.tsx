import { ChevronLeft, Eye, EyeOff } from 'lucide-react';
import { useState } from 'react';

import { Dona } from '@/components/dona';
import { PagosPendientes } from '@/components/pagos-pendientes';
import { Paginador } from '@/components/paginador';
import { TablaDeMovimientos } from '@/components/tabla-de-movimientos';
import { TablaPie, Td } from '@/components/tabla';
import { MovimientoModal } from '@/features/transactions/movimiento-modal';
import { Tendencia, TendenciaEsqueleto } from '@/components/tendencia';
import { ToolbarFiltros, type Orden } from '@/components/toolbar-filtros';
import { rutaSeleccionada } from '@/lib/movimientos';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { ApiClientError } from '@/lib/api-client';
import { rangoLargo } from '@/lib/fechas';
import { useAuth } from '@/lib/auth-context';
import { aParametros, llegaHastaHoy, useFiltros } from '@/lib/filtros';
import { useCategories, useDashboard, useTransactions } from '@/lib/queries';
import { cn, formatCOP } from '@/lib/utils';
import type { Category, SpendingByCategory, Transaction, TransactionType } from '@coco/types';

/**
 * Resumen.
 *
 * Todas las cifras son DERIVADAS: no hay ni una columna de saldo en la base.
 * Si un movimiento cambia, esto cambia solo.
 *
 * La pantalla se lee de arriba abajo como una sola pregunta que se va
 * acotando: qué recorte estoy mirando (toolbar), cuánto suma (indicadores),
 * cómo se comportó en el tiempo (tendencia) y en qué se fue (desglose).
 */
/**
 * Cuántas filas trae cada página de la tabla del resumen.
 *
 * La tabla enseña TODO lo que cae en el recorte, paginado. Enseñar "solo un
 * poco" obliga a saltar a otra pantalla para terminar la pregunta que uno ya
 * estaba haciendo aquí.
 */
const POR_PAGINA = 25;

/**
 * El nombre con el que saludar.
 *
 * Solo el de pila: "Hola de nuevo, Gerardo Andrés Viteri" no saluda a nadie,
 * recita un documento de identidad. Si no hay nombre, el correo tampoco sirve
 * para saludar, así que el saludo se queda solo.
 */
function nombreDePila(usuario: { display_name?: string | null } | null | undefined): string {
  return (usuario?.display_name ?? '').trim().split(/\s+/)[0] ?? '';
}

export function DashboardPage() {
  const { usuario } = useAuth();
  const { filtros, aplicar, limpiar, hayFiltrosActivos } = useFiltros();
  const dashboard = useDashboard(aParametros(filtros));

  // Los mismos filtros que el resto de la pantalla: si la lista de aquí abajo
  // no respondiera al recorte, contradiría las cifras de arriba.
  const [pagina, setPagina] = useState(1);
  const [orden, setOrden] = useState<Orden>('-date');
  const movimientos = useTransactions({
    ...aParametros(filtros),
    page: pagina,
    per_page: POR_PAGINA,
    sort: orden,
  });
  const categorias = useCategories();
  const arbol = categorias.data ?? [];

  /**
   * Conecta una cabecera con el orden.
   *
   * `primero` es la dirección del PRIMER clic, y no es la misma en todas: en
   * una fecha o un valor uno quiere ver lo más grande y lo más reciente
   * arriba; en un nombre, la A.
   */
  const ordenDe = (campo: string, primero: 'asc' | 'desc') => ({
    activo: orden === campo ? ('asc' as const) : orden === `-${campo}` ? ('desc' as const) : null,
    onCambiar: () => {
      setPagina(1);
      const descendente = `-${campo}` as Orden;
      const ascendente = campo as Orden;
      if (orden === ascendente) setOrden(descendente);
      else if (orden === descendente) setOrden(ascendente);
      else setOrden(primero === 'asc' ? ascendente : descendente);
    },
  });

  // El camino hasta lo que se está desglosando. Solo con UNA categoría marcada:
  // con varias no hay un "dentro de" único del que volver.
  const ruta =
    filtros.categoryIds.length === 1
      ? (() => {
          const { centro, grupo, concepto } = rutaSeleccionada(arbol, filtros.categoryIds[0]);
          return [centro, grupo, concepto].filter((n): n is Category => n !== undefined);
        })()
      : [];

  // El mismo modal que en Movimientos: editar desde el resumen no puede ser
  // otra pantalla ni otro formulario.
  const [editando, setEditando] = useState<Transaction | null | undefined>(undefined);
  const [conceptoSugerido, setConceptoSugerido] = useState<number | undefined>();
  const [tipoNuevo, setTipoNuevo] = useState<TransactionType>('expense');

  /*
    ── Lo que habla del mes en curso solo aparece si se está mirando el mes ──
    El presupuesto necesario y los pagos pendientes NO son del recorte: son
    siempre del mes de hoy. Puestos al lado de las cifras de agosto de 2024,
    no llegan tarde —responden otra pregunta—, y en un periodo que ya cerró no
    queda nada pendiente, porque ya pasó.

    La prueba es si el recorte llega hasta hoy. Así el mes en curso los
    enseña, y también el año en curso o todo el histórico —que lo contienen—,
    mientras que cualquier periodo cerrado los esconde.
  */
  const alDia = llegaHastaHoy(filtros);

  /*
    La tarjeta de pendientes solo existe si hay algo pendiente.

    Vacía no dice "todo al día": dice "aquí hay una sección", y ocupa un tercio
    de la fila para decirlo. En un periodo cerrado no puede quedar nada
    pendiente —ya pasó— y en el mes en curso, con todo pagado, la buena noticia
    es que la tarjeta no esté.
  */
  const hayPendientes = alDia && (dashboard.data?.pending.length ?? 0) > 0;

  return (
    <div className="flex flex-col gap-4 sm:gap-5">
      <ToolbarFiltros
        titulo={`Hola de nuevo${nombreDePila(usuario) ? `, ${nombreDePila(usuario)}` : ''}!`}
        subtitulo={
          dashboard.data
            ? `${dashboard.data.range.count} movimientos · ${formatCOP(dashboard.data.range.expense)} gastados`
            : 'Todo se calcula de tus movimientos.'
        }
        filtros={filtros}
        aplicar={(c) => {
          setPagina(1);
          aplicar(c);
        }}
        limpiar={() => {
          setPagina(1);
          limpiar();
        }}
        hayFiltrosActivos={hayFiltrosActivos}
        onNuevo={(tipo) => {
          setTipoNuevo(tipo);
          setConceptoSugerido(undefined);
          setEditando(null);
        }}
      />

      {dashboard.isError && (
        <Alert variant="destructive">
          <AlertTitle>No se pudo cargar el resumen</AlertTitle>
          <AlertDescription>
            {dashboard.error instanceof ApiClientError
              ? dashboard.error.message
              : 'Revisa que la API esté corriendo.'}
          </AlertDescription>
        </Alert>
      )}

      {dashboard.isPending && (
        <>
          <div className="grid gap-3 sm:grid-cols-2 sm:gap-5 xl:grid-cols-4">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-24 rounded-lg" />
            ))}
          </div>
          <div className="grid gap-3 sm:gap-5 lg:grid-cols-[minmax(0,1fr)_repeat(2,minmax(20%,30rem))] lg:grid-rows-[420px]">
            <Card className="h-full min-h-0">
              <CardContent className="flex h-full flex-col p-4 sm:p-6">
                <Skeleton className="mb-4 h-6 w-40" />
                <div className="min-h-0 flex-1">
                  <TendenciaEsqueleto />
                </div>
              </CardContent>
            </Card>
            <Skeleton className="h-72 w-full rounded-lg lg:h-full" />
            <Skeleton className="h-72 w-full rounded-lg lg:h-full" />
          </div>
        </>
      )}

      {dashboard.data && (
        <>
          {/* Cuatro indicadores: de a dos en una tableta y de a cuatro en una
              pantalla ancha. En tres columnas, el cuarto se quedaba solo en
              una fila para él. */}
          <div className="grid gap-3 sm:grid-cols-2 sm:gap-5 xl:grid-cols-4">
            {/*
              Va PRIMERO, antes de lo gastado, porque se lee antes: cuánto hay
              que tener y después cuánto se lleva gastado.

              En un periodo CERRADO el presupuesto necesario fue exactamente lo
              que costó: ya no es una previsión, es un hecho. Enseñar ahí la
              previsión del mes en curso sería contestar con el dato de otro
              mes, y dejar el hueco vacío haría creer que en 2024 no hubo
              costos fijos.
            */}
            <Kpi
              etiqueta="Presupuesto necesario"
              valor={formatCOP(alDia ? dashboard.data.required_budget : dashboard.data.range.expense)}
              detalle={alDia ? 'Costos fijos de este mes' : 'Lo que costó el periodo'}
            />
            <Kpi
              etiqueta="Gastos del periodo"
              valor={formatCOP(dashboard.data.range.expense)}
              // Cuánto fue fijo y cuánto variable. Los nombres son los de los
              // centros de costos, así que si mañana se llaman de otra forma,
              // el indicador lo dice solo.
              desglose={dashboard.data.expense_by_center}
              acento="expense"
            />
            <Kpi
              etiqueta="Ingresos del periodo"
              valor={formatCOP(dashboard.data.range.income)}
              acento="income"
            />
            <Kpi
              etiqueta="Movimientos"
              valor={String(dashboard.data.range.count)}
              detalle={rangoLargo(dashboard.data.period.from, dashboard.data.period.to)}
            />
          </div>

          {/* La gráfica dice CUÁNDO se gastó y la dona EN QUÉ. Son la misma
              pregunta partida en dos, así que van a la misma altura: una
              debajo de la otra obliga a desplazarse para cruzarlas. */}
          {/*
            ── Quién manda sobre el alto de esta fila ────────────────────────
            La gráfica. Su lienzo tiene una PROPORCIÓN propia —16:7— así que
            mide por sí mismo, sin preguntarle a nadie, y con un tope para que
            en una pantalla ancha no se estire sin fin. De ahí sale el alto de
            su tarjeta, de ahí el de la fila, y la tarjeta de la dona se estira
            hasta igualarlo.

            Lo que no puede pasar es lo contrario: que la gráfica mida contra
            su tarjeta y la tarjeta contra la gráfica. Eso no es una cadena, es
            un círculo, y el navegador lo resuelve como puede —que fue lo que
            se salió de la página—.

            ── El alto ──────────────────────────────────────────────────────
            UN número —420px— y va en la PISTA de la rejilla, no en la caja.

            Con `h-[380px]` en la caja la pista seguía siendo `auto`: nadie le
            había dicho cuánto mide. Entonces el `h-full` de cada tarjeta no
            tenía contra qué resolverse, así que cada una crecía con su
            contenido —la lista de pendientes son ocho filas, 670px—, la pista
            crecía con ellas y la caja se quedaba en 380. Las tarjetas se
            salían por debajo y pintaban encima de la tabla de movimientos.

            Declarando la PISTA, el alto es un dato desde el principio: las
            tres tarjetas miden 420, su `h-full` resuelve, y lo que no quepa se
            desplaza dentro de la suya.

            El `min-h-0` de cada tarjeta es la otra mitad. Un elemento de
            rejilla tiene `min-height: auto`, que es su mínimo de contenido: sin
            ponerlo en cero, la lista larga vuelve a mandar sobre los 420 y
            estamos donde empezamos.

            ── El ancho de las dos columnas de la derecha ────────────────────
            Las dos MISMAS: pagos pendientes y distribución son dos respuestas
            del mismo tamaño y una más angosta que la otra se lee como si
            importara menos. Se escriben con `repeat(2, …)` para que no puedan
            separarse cuando alguien toque una y se olvide de la otra.

            Nunca menos del 20 % de la fila y nunca más de 30rem —la medida
            que ya tenía la distribución—, con los dos extremos concretos:
            dejarlas en `auto` las haría depender de su contenido, y su
            contenido depende de ellas.
          */}
          <div
            className={cn(
              'grid gap-3 sm:gap-5 lg:grid-rows-[420px]',
              // Sin los pagos pendientes, la fila son DOS tarjetas. Dejando
              // tres columnas, la distribución se quedaría en el centro con un
              // hueco del ancho de una tarjeta a su derecha.
              hayPendientes
                ? 'lg:grid-cols-[minmax(0,1fr)_repeat(2,minmax(20%,30rem))]'
                : 'lg:grid-cols-[minmax(0,1fr)_minmax(20%,30rem)]',
            )}
          >
            <Card className="h-full min-h-0">
              <CardContent className="flex h-full flex-col p-4 sm:p-6">
                <h2 className="mb-4 font-display text-lg font-semibold">Comportamiento</h2>
                {/*
                  `flex-1` con un mínimo, no una proporción fija.

                  Con proporción, el alto de la gráfica salía de su ancho —y al
                  angostarse su columna, de golpe medía menos que las tarjetas
                  de al lado—: la fila la estiraban ellas, la gráfica se
                  quedaba con su alto pequeño y aparecía pegada arriba con el
                  resto de la tarjeta en blanco.

                  Ahora se estira hasta el alto de la fila, sea quien sea el
                  que lo fije, y el mínimo evita que se aplaste cuando la fila
                  es baja.
                */}
                <div className="min-h-0 flex-1">
                  <Tendencia
                    puntos={dashboard.data.trend}
                    granularidad={dashboard.data.period.granularity}
                  />
                </div>
              </CardContent>
            </Card>

            {hayPendientes && (
              <PagosPendientes
                className="min-h-0"
                pagos={dashboard.data.pending}
                // Abre el modal de CREAR con el concepto ya puesto: el pago
                // que falta es justo el que se acaba de señalar.
                onElegir={(pago) => {
                  setConceptoSugerido(pago.category_id);
                  setTipoNuevo('expense');
                  setEditando(null);
                }}
              />
            )}

            <div className="h-full min-h-0">
              <Distribucion
                filas={dashboard.data.by_category}
                nivel={dashboard.data.breakdown_level}
                padre={dashboard.data.breakdown_parent}
                totalGastado={dashboard.data.range.expense}
                ruta={ruta}
                onBajar={(id) => {
                  setPagina(1);
                  aplicar({ categoryIds: [id] });
                }}
                onSubir={() => {
                  setPagina(1);
                  aplicar({ categoryIds: ruta.length > 1 ? [ruta[ruta.length - 2].id] : [] });
                }}
              />
            </div>
          </div>

          <div className="flex min-w-0 flex-col gap-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="font-display text-lg font-semibold">Movimientos</h2>
              {(movimientos.data?.meta?.total ?? 0) > 0 && (
                <p className="text-sm text-muted-foreground" aria-live="polite">
                  {(pagina - 1) * POR_PAGINA + 1} a{' '}
                  {Math.min(pagina * POR_PAGINA, movimientos.data!.meta.total)} de{' '}
                  {movimientos.data!.meta.total}
                </p>
              )}
            </div>

            <TablaDeMovimientos
              movimientos={movimientos.data?.data ?? []}
              arbol={arbol}
              cargando={movimientos.isPending}
              onAbrir={setEditando}
              orden={ordenDe}
              filasDelEsqueleto={8}
              pie={
                movimientos.data && movimientos.data.data.length > 0 ? (
                  <TablaPie>
                    <tr>
                      <Td fija divisor={false}>
                        Total · {movimientos.data.meta.total} movimientos
                      </Td>
                      <Td />
                      <Td />
                      <Td />
                      <Td />
                      <Td alineado="derecha" className="tabular font-semibold text-expense">
                        {formatCOP(movimientos.data.meta.sum_expense ?? '0')}
                      </Td>
                    </tr>
                  </TablaPie>
                ) : undefined
              }
            />

            <Paginador
              pagina={pagina}
              total={movimientos.data?.meta?.total ?? 0}
              porPagina={POR_PAGINA}
              onCambiar={setPagina}
            />
          </div>
        </>
      )}

      <MovimientoModal
        abierta={editando !== undefined}
        movimiento={editando}
        categoriaPorDefecto={conceptoSugerido}
        tipoPorDefecto={tipoNuevo}
        onCerrar={() => {
          setEditando(undefined);
          setConceptoSugerido(undefined);
        }}
      />
    </div>
  );
}

function Kpi({
  etiqueta,
  valor,
  detalle,
  desglose,
  acento,
}: {
  etiqueta: string;
  valor: string;
  detalle?: string;
  /** En qué se reparte la cifra. Se escribe debajo, con su nombre y su monto. */
  desglose?: SpendingByCategory[];
  acento?: 'income' | 'expense';
}) {
  return (
    <Card>
      {/*
        ── Sin icono ─────────────────────────────────────────────────────────
        Llevaba un pastel de color con un glifo dentro, y no decía nada que no
        dijera ya el rótulo: una cartera junto a «Presupuesto necesario», un
        recibo junto a «Movimientos». Un icono que repite la palabra que tiene
        al lado no ayuda a encontrar nada; solo le quita 40px de ancho a la
        cifra, que es lo único que se viene a leer aquí.

        Distinto es el icono que sustituye a una palabra —el de un botón sin
        texto— o el que distingue entre cosas del mismo tipo. Ninguno de los
        dos era el caso.
      */}
      <CardContent className="p-4 sm:p-6">
        <div className="min-w-0">
          {/* Sin mayúsculas sostenidas ni interletraje abierto. Era el
              rótulo en versalitas del panel de control de siempre, y con la
              tipografía del tema —que declara el interletraje en cero— se lee
              como si viniera de otro producto. Un rótulo en minúsculas se lee
              de un golpe; en sostenidas hay que descifrarlo letra a letra. */}
          <p className="text-xs font-medium text-muted-foreground">{etiqueta}</p>
          <p
            className={
              // `sm:text-3xl` y no unos 28px a mano: 30 es el escalón que
              // sigue a 24 en la escala, y la diferencia con 28 no la nota
              // nadie —la de tener una medida fuera de la escala, sí—.
              'tabular mt-1 truncate text-2xl font-semibold leading-tight sm:text-3xl ' +
              (acento === 'income' ? 'text-income' : acento === 'expense' ? 'text-expense' : '')
            }
          >
            {valor}
          </p>
          {detalle && <p className="mt-1 truncate text-xs text-muted-foreground">{detalle}</p>}

          {/* Envuelve en vez de truncarse: un reparto a medias —"Costos fij…"—
              no dice menos, dice otra cosa. Cada parte se queda entera y se
              pasa a la línea de abajo si la tarjeta es angosta. */}
          {desglose && desglose.length > 0 && (
            <p className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
              {desglose.map((parte) => (
                <span key={parte.category_id ?? parte.name} className="whitespace-nowrap">
                  {parte.name}{' '}
                  <strong className="tabular font-semibold text-foreground">
                    {formatCOP(parte.total)}
                  </strong>
                </span>
              ))}
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * En qué se fue, al nivel que corresponda.
 *
 * Cada fila BAJA un nivel al tocarla: de centros a grupos, de grupos a
 * conceptos. Es la forma de responder "¿y dentro de esto, qué?" sin cambiar de
 * pantalla ni perder el rango de fechas.
 */
/**
 * En qué se repartió el gasto.
 *
 * ── Por qué una dona y no barras ────────────────────────────────────────────
 * Porque la pregunta es de PROPORCIÓN, no de ranking: cuánto se lleva cada
 * centro DEL TOTAL. Una fila de barras compara unas con otras y deja el total
 * implícito; la dona lo pone en el centro y cada porción se lee contra él sin
 * hacer ninguna cuenta.
 */
function Distribucion({
  filas,
  nivel,
  padre,
  totalGastado,
  ruta,
  onBajar,
  onSubir,
}: {
  filas: { category_id: number | null; name: string; total: string; count: number }[];
  nivel: string;
  /** De quién son las filas. `null` cuando son los centros de costos. */
  padre: { id: number; name: string } | null;
  totalGastado: string;
  /** El camino hasta donde se bajó. Vacío = se está en los centros de costos. */
  ruta: { id: number; name: string }[];
  onBajar: (id: number) => void;
  onSubir: () => void;
}) {
  const total = Number.parseFloat(totalGastado) || 0;
  const [verLista, setVerLista] = useState(true);

  return (
    <Card className="h-full min-h-0">
      <CardContent className="flex h-full flex-col p-4 sm:p-6">
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-display text-lg font-semibold">Distribución de costos</h2>
          {/* Esconder los nombres no cambia el ancho de la tarjeta: lo fija la
              rejilla del resumen, no lo que haya dentro. */}
          {/* Mismo botón que los de la barra de filtros: la variante
              `herramienta` y el tamaño `chip-icon`. Un control que hace lo
              mismo —encender y apagar algo de la vista— tiene que verse igual
              en las dos pantallas. */}
          <Button
            type="button"
            variant="herramienta"
            size="sm-icon"
            aria-pressed={!verLista}
            aria-label={verLista ? 'Ocultar los nombres' : 'Mostrar los nombres'}
            title={verLista ? 'Ocultar los nombres' : 'Mostrar los nombres'}
            onClick={() => setVerLista((v) => !v)}
          >
            {verLista ? (
              <Eye className="size-4" aria-hidden="true" />
            ) : (
              <EyeOff className="size-4" aria-hidden="true" />
            )}
          </Button>
        </div>

        {/* Bajar de nivel es un clic; subir tiene que serlo también. Sin esto,
            entrar en un centro de costos era un viaje de ida: la única salida
            era limpiar el filtro entero desde la barra de arriba. */}
        {ruta.length > 0 ? (
          <button
            type="button"
            onClick={onSubir}
            className="flex min-w-0 items-center gap-1 self-start rounded-sm text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            <ChevronLeft className="size-3.5 shrink-0" aria-hidden="true" />
            <span className="truncate">{ruta.map((n) => n.name).join(' · ')}</span>
          </button>
        ) : (
          /* El NOMBRE de a quién pertenecen estas filas, no el nivel al que
             están. "Por grupo" no dice de qué: los grupos de cuál centro. */
          <p className="truncate text-xs text-muted-foreground">
            {padre?.name ?? `Por ${nivel}`}
          </p>
        )}

        {/* `flex-1` para que la dona tenga contra qué medir: la tarjeta ya
            tiene alto —se lo dio la fila— y este es el trozo que le queda. */}
        <Dona
          className="mt-6 min-h-0 flex-1"
          mostrarLista={verLista}
          total={total}
          porciones={filas.map((f) => ({
            id: f.category_id,
            nombre: f.name,
            valor: Number.parseFloat(f.total) || 0,
          }))}
          onElegir={nivel === 'concepto' ? undefined : onBajar}
        />
      </CardContent>
    </Card>
  );
}


