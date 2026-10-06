import { ArrowRightLeft, Minus, Plus } from 'lucide-react';

import { DEFAULT_CURRENCY, formatCOP, formatMoney } from '@/shared/lib/format';
import { t } from '@/shared/lib/i18n';
import { cn } from '@/shared/lib/utils';

/**
 * Hacia dónde va la plata: entra, sale o solo se mueve entre cuentas.
 *
 * Es lo único que `Monto` necesita saber, y no es un tipo del dominio: quien
 * tiene un movimiento traduce su `type` con `sentidoDelMovimiento`
 * (`features/transactions/model/movimientos.ts`). Así `shared/ui` no conoce
 * qué es un movimiento.
 */
export type MoneyDirection = 'in' | 'out' | 'transfer';

interface AmountProps {
  amount: string;
  /** ISO 4217 code of the movement; aggregates leave it out. */
  currency?: string;
  direction?: MoneyDirection;
  className?: string;
  /** Oculta el icono cuando el contexto ya deja clarísimo el signo. */
  isTextOnly?: boolean;
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
export function Amount({
  amount,
  currency = DEFAULT_CURRENCY,
  direction = 'out',
  className,
  isTextOnly = false,
}: AmountProps) {
  const styles = {
    in: {
      color: 'text-income',
      sign: '+',
      Icon: Plus,
      label: t('transactions.types.income'),
    },
    out: {
      color: 'text-expense',
      sign: '−',
      Icon: Minus,
      label: t('transactions.types.expense'),
    },
    transfer: {
      color: 'text-muted-foreground',
      sign: '',
      Icon: ArrowRightLeft,
      label: t('transactions.types.transfer'),
    },
  }[direction];

  const { Icon } = styles;

  return (
    <span
      className={cn('tabular inline-flex items-center gap-1 font-medium', styles.color, className)}
    >
      {!isTextOnly && <Icon className="size-3.5 shrink-0" aria-hidden="true" />}
      <span className="sr-only">{styles.label}: </span>
      <span>
        {styles.sign}
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
export function Balance({ amount, className }: { amount: string; className?: string }) {
  const value = Number.parseFloat(amount);
  const isNegative = Number.isFinite(value) && value < 0;

  return (
    <span className={cn('tabular font-medium', isNegative && 'text-warning', className)}>
      {formatCOP(amount)}
    </span>
  );
}
