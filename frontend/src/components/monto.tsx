import type { TransactionType } from '@coco/types';
import { ArrowRightLeft, Minus, Plus } from 'lucide-react';
import { cn, DEFAULT_CURRENCY, formatCOP, formatMoney } from '@/lib/utils';

interface MontoProps {
  amount: string;
  /** ISO 4217 code of the movement; aggregates leave it out. */
  currency?: string;
  type?: TransactionType;
  className?: string;
  /** Oculta el icono cuando el contexto ya deja clarísimo el signo. */
  soloTexto?: boolean;
}

/**
 * Muestra un monto con su semántica.
 *
 * Regla de accesibilidad que se respeta aquí: el estado NUNCA depende solo del
 * color. Cada monto lleva además signo e icono, así que alguien con daltonismo
 * —o mirando una impresión en blanco y negro— distingue igual un ingreso de un
 * gasto.
 *
 * Semántica: ingreso = teal, gasto = morado. El rojo NO se usa para gastos;
 * está reservado para errores y acciones destructivas.
 */
export function Monto({
  amount,
  currency = DEFAULT_CURRENCY,
  type = 'expense',
  className,
  soloTexto = false,
}: MontoProps) {
  const estilos = {
    income: { color: 'text-income', signo: '+', Icono: Plus, etiqueta: 'Ingreso' },
    expense: { color: 'text-expense', signo: '−', Icono: Minus, etiqueta: 'Gasto' },
    transfer: {
      color: 'text-muted-foreground',
      signo: '',
      Icono: ArrowRightLeft,
      etiqueta: 'Transferencia',
    },
  }[type];

  const { Icono } = estilos;

  return (
    <span
      className={cn('tabular inline-flex items-center gap-1 font-medium', estilos.color, className)}
    >
      {!soloTexto && <Icono className="size-3.5 shrink-0" aria-hidden="true" />}
      <span className="sr-only">{estilos.etiqueta}: </span>
      <span>
        {estilos.signo}
        {formatMoney(amount, currency)}
      </span>
    </span>
  );
}

/**
 * Monto neutro para saldos: sin signo forzado, pero coloreado si es negativo.
 * Un saldo negativo se marca en ámbar (atención), no en rojo: no es un error
 * del sistema, es información.
 */
export function Saldo({ amount, className }: { amount: string; className?: string }) {
  const valor = Number.parseFloat(amount);
  const esNegativo = Number.isFinite(valor) && valor < 0;

  return (
    <span className={cn('tabular font-medium', esNegativo && 'text-warning', className)}>
      {formatCOP(amount)}
    </span>
  );
}
