import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** Compone clases de Tailwind resolviendo conflictos (la última gana). */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

const COP = new Intl.NumberFormat('es-CO', {
  style: 'currency',
  currency: 'COP',
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

const COP_CON_CENTAVOS = new Intl.NumberFormat('es-CO', {
  style: 'currency',
  currency: 'COP',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/**
 * Formatea un monto para MOSTRAR.
 *
 * Recibe el string decimal que entrega la API. Se convierte a número solo aquí,
 * en el borde de presentación: nunca se hace aritmética de dinero con el
 * resultado. Los centavos se ocultan cuando son `.00`, que es el caso normal
 * en COP.
 */
export function formatCOP(amount: string | number): string {
  const value = typeof amount === 'string' ? Number.parseFloat(amount) : amount;
  if (!Number.isFinite(value)) return '—';

  const tieneCentavos = Math.round(value * 100) % 100 !== 0;
  return (tieneCentavos ? COP_CON_CENTAVOS : COP).format(value);
}
