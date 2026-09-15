import { Flag, SearchX } from 'lucide-react';
import type { ReactNode } from 'react';

import { EstadoVacio } from '@/components/estado-vacio';
import { rutaSeleccionada } from '@/components/toolbar-filtros';
import { Tabla, TablaEsqueleto, Td, Th, Tr } from '@/components/tabla';
import { Card, CardContent } from '@/components/ui/card';
import { useActualizarMovimiento } from '@/lib/queries';
import { cn, formatCOP } from '@/lib/utils';
import type { Category, Transaction } from '@coco/types';

/** Las columnas, en un solo sitio: el esqueleto tiene que tener las mismas. */
export const COLUMNAS = ['Concepto', 'Centro de costos', 'Grupo', 'Pago', 'Periodo', 'Valor'];

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
  if (cargando) return <TablaEsqueleto columnas={COLUMNAS} filas={filasDelEsqueleto} />;

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
          <Th fija orden={orden?.('merchant', 'asc')}>Concepto</Th>
          <Th>Centro de costos</Th>
          <Th>Grupo</Th>
          <Th orden={orden?.('date', 'desc')}>Pago</Th>
          <Th>Periodo</Th>
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
  const { centro, grupo } = rutaSeleccionada(arbol, movimiento.category_id ?? undefined);

  // Cambiar el selector guarda EXACTAMENTE lo elegido, sin adivinar el resto.
  // La tentación es "conservar el concepto si existe con el mismo nombre en el
  // grupo nuevo", pero eso mueve plata a un sitio que nadie pidió y nadie ve.
  const reclasificar = (id: number | undefined): void => {
    actualizar.mutate({ id: movimiento.id, cambios: { category_id: id ?? null } });
  };

  // Sin clasificar no es un error, es algo pendiente: la fila se marca para que
  // se vea de lejos cuál falta por ordenar después de una importación.
  const sinClasificar = movimiento.category_id === null;

  return (
    <Tr onClick={onAbrir} atencion={sinClasificar} atenuada={actualizar.isPending}>
      <Td fija atencion={sinClasificar}>
        <span className="flex items-center gap-2">
          {sinClasificar && (
            <Flag className="size-3.5 shrink-0 text-warning" fill="currentColor" aria-label="Sin clasificar" />
          )}
          <span className="block max-w-[14rem] truncate font-medium">
            {movimiento.description ?? movimiento.merchant ?? 'Sin concepto'}
          </span>
        </span>
      </Td>

      {/* Los selectores paran el clic: desplegar una lista no puede abrir
          además el modal que hay detrás. */}
      <Td className="w-48" >
        <span onClick={(e) => e.stopPropagation()}>
          <SelectorEnFila
            aria="Centro de costos"
            valor={centro?.id}
            opciones={arbol}
            onElegir={reclasificar}
          />
        </span>
      </Td>

      <Td className="w-48">
        <span onClick={(e) => e.stopPropagation()}>
          <SelectorEnFila
            aria="Grupo"
            valor={grupo?.id}
            opciones={centro?.children ?? []}
            deshabilitado={!centro}
            onElegir={(id) => reclasificar(id ?? centro?.id)}
          />
        </span>
      </Td>

      <Td className="tabular whitespace-nowrap text-muted-foreground">{diaBonito(movimiento.date)}</Td>

      <Td className="whitespace-nowrap text-muted-foreground">
        <span
          className={cn(
            periodo(movimiento) !== mesDe(movimiento.date) && 'font-medium text-warning',
          )}
        >
          {mesBonito(periodo(movimiento))}
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
  onElegir,
}: {
  aria: string;
  valor?: number;
  opciones: Category[];
  deshabilitado?: boolean;
  onElegir: (id: number | undefined) => void;
}) {
  return (
    <select
      aria-label={aria}
      value={valor ?? ''}
      disabled={deshabilitado || opciones.length === 0}
      onChange={(e) => onElegir(e.target.value === '' ? undefined : Number(e.target.value))}
      className={cn(
        'min-w-0 flex-1 truncate rounded-lg border bg-card px-2 py-1.5 text-xs',
        'outline-none focus-visible:ring-1 focus-visible:ring-ring',
        'disabled:cursor-not-allowed disabled:opacity-40',
      )}
      style={{ borderColor: 'var(--input)' }}
    >
      <option value="">{aria}…</option>
      {opciones.map((o) => (
        <option key={o.id} value={o.id}>
          {o.name}
        </option>
      ))}
    </select>
  );
}
