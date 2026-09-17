import { Flag, SearchX } from 'lucide-react';
import type { ReactNode } from 'react';

import { EstadoVacio } from '@/components/estado-vacio';
import { nombreDelMovimiento, rutaSeleccionada } from '@/lib/movimientos';
import { Tabla, TablaEsqueleto, Td, Th, Tr } from '@/components/tabla';
import { Select } from '@/components/ui/select';
import { ConTooltip } from '@/components/ui/tooltip';
import { Card, CardContent } from '@/components/ui/card';
import { useActualizarMovimiento } from '@/lib/queries';
import { cn, formatCOP } from '@/lib/utils';
import type { Category, Transaction } from '@coco/types';

/** Las columnas, en un solo sitio: el esqueleto tiene que tener las mismas. */
export const COLUMNAS = [
  'Concepto',
  'Periodo',
  'Fecha de pago',
  'Centro de costos',
  'Categoría',
  'Valor',
];

export interface OrdenDeColumna {
  activo: 'asc' | 'desc' | null;
  onCambiar: () => void;
}

/**
 * La tabla de movimientos.
 *
 * ── Por qué es un componente y no dos tablas ────────────────────────────────
 * Porque el resumen y la pantalla de Movimientos enseñan lo MISMO: las mismas
 * columnas, la misma edición en la fila, el mismo modal. Escritas por separado
 * empiezan iguales y se van separando —una aprende a marcar lo que falta por
 * clasificar y la otra no— hasta que la misma plata se ve distinta según por
 * dónde se entre.
 *
 * Lo que cambia entre las dos es el CONTORNO: si hay cabeceras que ordenan, si
 * hay pie de totales y cuántas filas caben. Eso es lo que se pasa.
 */
export function TablaDeMovimientos({
  movimientos,
  arbol,
  cargando = false,
  onAbrir,
  orden,
  pie,
  vacio,
  filasDelEsqueleto = 8,
}: {
  movimientos: Transaction[];
  arbol: Category[];
  cargando?: boolean;
  onAbrir: (movimiento: Transaction) => void;
  /** Sin esto las cabeceras no ordenan: en un resumen no tendría sentido. */
  orden?: (campo: string, primero: 'asc' | 'desc') => OrdenDeColumna;
  pie?: ReactNode;
  vacio?: ReactNode;
  filasDelEsqueleto?: number;
}) {
  if (cargando) {
    return <TablaEsqueleto columnas={COLUMNAS} filas={filasDelEsqueleto} divisor={false} />;
  }

  if (movimientos.length === 0) {
    return (
      <Card>
        <CardContent className="p-0">
          {vacio ?? (
            <EstadoVacio
              Icono={SearchX}
              titulo="Ningún movimiento coincide"
              ayuda="Los filtros están dejando todo fuera."
            />
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <Tabla>
      <thead>
        <tr>
          <Th fija divisor={false} orden={orden?.('merchant', 'asc')}>
            Concepto
          </Th>
          {/* El periodo antes que el pago: es el eje con el que se mira la app
              —el mes AL QUE PERTENECE el gasto— y la fecha de pago es el dato
              de apoyo que explica por qué a veces no coinciden. */}
          <Th>Periodo</Th>
          <Th orden={orden?.('date', 'desc')}>Fecha de pago</Th>
          <Th>Centro de costos</Th>
          <Th>Categoría</Th>
          <Th alineado="derecha" orden={orden?.('amount', 'desc')}>
            Valor
          </Th>
        </tr>
      </thead>

      <tbody>
        {movimientos.map((m) => (
          <Fila key={m.id} movimiento={m} arbol={arbol} onAbrir={() => onAbrir(m)} />
        ))}
      </tbody>

      {pie}
    </Tabla>
  );
}

function Fila({
  movimiento,
  arbol,
  onAbrir,
}: {
  movimiento: Transaction;
  arbol: Category[];
  onAbrir: () => void;
}) {
  const actualizar = useActualizarMovimiento();
  const { centro, categoria } = rutaSeleccionada(arbol, movimiento.category_id ?? undefined);

  // Cambiar el selector guarda EXACTAMENTE lo elegido, sin adivinar el resto.
  // La tentación es "conservar el concepto si existe con el mismo nombre en el
  // categoría nuevo", pero eso mueve plata a un sitio que nadie pidió y nadie ve.
  const reclasificar = (id: number | undefined): void => {
    actualizar.mutate({ id: movimiento.id, cambios: { category_id: id ?? null } });
  };

  // Sin clasificar no es un error, es algo pendiente: la fila se marca para que
  // se vea de lejos cuál falta por ordenar después de una importación.
  const sinClasificar = movimiento.category_id === null;

  /*
    Un centro ESTÁTICO no se reclasifica desde aquí.

    La estructura de los costos fijos no se improvisa —el alquiler no cambia
    de categoría un martes—, y en una tabla de cien filas con un desplegable en
    cada una, un clic distraído mueve plata de sitio sin que nadie lo note.

    Tampoco desde el modal del movimiento: estático es estático. Si de verdad
    hay que mover algo, se hace dinámico el centro desde Centros de costos —un
    acto deliberado, en otra pantalla— y entonces se mueve.
  */
  const estatico = centro?.estatico ?? false;
  const motivo = estatico
    ? `“${centro?.name}” es un centro estático. La clasificación solo se modifica desde Centros de costos.`
    : undefined;

  return (
    <Tr onClick={onAbrir} atencion={sinClasificar} atenuada={actualizar.isPending}>
      <Td fija divisor={false} atencion={sinClasificar}>
        <span className="flex items-center gap-2">
          {sinClasificar && (
            <Flag className="size-3.5 shrink-0 text-warning" fill="currentColor" aria-label="Sin clasificar" />
          )}
          {/* El nombre SALE del concepto: un movimiento es un registro y lo
              toma de donde pertenece. Pintaba `description`, que dejó de
              rellenarse cuando la ficha cambió su campo libre de «Concepto»
              por un selector de conceptos —así que todo lo registrado a mano
              decía «Sin concepto» aunque tuviera su concepto elegido—. */}
          <span className="block max-w-[14rem] truncate font-medium">
            {nombreDelMovimiento(movimiento, arbol)}
          </span>
        </span>
      </Td>

      <Td className="whitespace-nowrap text-muted-foreground">
        {/*
          En ámbar cuando el mes al que PERTENECE el gasto no es aquel en que
          salió la plata: la factura de julio pagada el 4 de agosto. Es el caso
          que descuadra los totales de quien no lo nota —julio parece barato y
          agosto caro— así que se marca, con punto y con explicación.
        */}
        {desfasado(movimiento) ? (
          <ConTooltip
            texto={`Pertenece a ${mesBonito(periodo(movimiento))}, pero se pagó el ${diaBonito(movimiento.date)}`}
            className="items-center gap-1.5 font-medium text-warning"
          >
            {/* El punto hace notar la marca: el color solo se pierde en una
                columna de texto gris, y quien no lo nota no sabe que hay algo
                que preguntar. */}
            <span aria-hidden="true" className="size-1.5 shrink-0 rounded-full bg-warning" />
            {mesBonito(periodo(movimiento))}
          </ConTooltip>
        ) : (
          mesBonito(periodo(movimiento))
        )}
      </Td>

      <Td className="tabular whitespace-nowrap text-muted-foreground">
        {diaBonito(movimiento.date)}
      </Td>

      {/* Los selectores paran el clic: desplegar una lista no puede abrir
          además el modal que hay detrás. */}
      <Td className="w-48">
        <span onClick={(e) => e.stopPropagation()}>
          <SelectorEnFila
            aria="Centro de costos"
            valor={centro?.id}
            opciones={arbol}
            deshabilitado={estatico}
            motivo={motivo}
            onElegir={reclasificar}
          />
        </span>
      </Td>

      <Td className="w-48">
        <span onClick={(e) => e.stopPropagation()}>
          <SelectorEnFila
            aria="Categoría"
            valor={categoria?.id}
            opciones={centro?.children ?? []}
            deshabilitado={estatico || !centro}
            motivo={motivo}
            onElegir={(id) => reclasificar(id ?? centro?.id)}
          />
        </span>
      </Td>

      <Td
        alineado="derecha"
        className={cn(
          'tabular whitespace-nowrap font-semibold',
          movimiento.type === 'income' ? 'text-income' : 'text-expense',
        )}
      >
        {movimiento.type === 'income' ? '+' : '−'}
        {formatCOP(movimiento.amount)}
      </Td>
    </Tr>
  );
}

const MESES = [
  'ene', 'feb', 'mar', 'abr', 'may', 'jun',
  'jul', 'ago', 'sep', 'oct', 'nov', 'dic',
];

const mesDe = (iso: string): string => iso.slice(0, 7);

/**
 * El periodo del movimiento.
 *
 * Con respaldo en la fecha de pago a propósito: durante un despliegue conviven
 * unos segundos la API vieja —que no manda `period`— y el frontend nuevo, y un
 * campo ausente no puede dejar la pantalla en blanco.
 */
const periodo = (m: Transaction): string => mesDe(m.period ?? m.date);

/** El gasto pertenece a un mes y se pagó en otro. */
const desfasado = (m: Transaction): boolean => periodo(m) !== mesDe(m.date);

/** `2026-03-06` → `6 mar 2026`. */
function diaBonito(iso: string): string {
  const [a, m, d] = iso.split('-');
  return `${Number(d)} ${MESES[Number(m) - 1] ?? m} ${a}`;
}

/** `2026-03-01` → `mar 2026`. El periodo es un mes, no un día. */
function mesBonito(iso: string): string {
  const [a, m] = iso.split('-');
  return `${MESES[Number(m) - 1] ?? m} ${a}`;
}

function SelectorEnFila({
  aria,
  valor,
  opciones,
  deshabilitado,
  motivo,
  onElegir,
}: {
  aria: string;
  valor?: number;
  opciones: Category[];
  deshabilitado?: boolean;
  /** Por qué está bloqueado. Un control apagado sin explicación se lee como
      un error de la aplicación. */
  motivo?: string;
  onElegir: (id: number | undefined) => void;
}) {
  const selector = (
    <Select
      tamano="sm"
      etiqueta={aria}
      vacio={`${aria}…`}
      valor={valor === undefined ? '' : String(valor)}
      deshabilitado={deshabilitado}
      opciones={opciones.map((o) => ({ valor: String(o.id), etiqueta: o.name }))}
      onCambiar={(v) => onElegir(v === '' ? undefined : Number(v))}
    />
  );

  if (!deshabilitado || motivo === undefined) return selector;

  return (
    <ConTooltip texto={motivo} className="w-full">
      {selector}
    </ConTooltip>
  );
}
