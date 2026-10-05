import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** Compone clases de Tailwind resolviendo conflictos (la última gana). */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

/**
 * The currency of anything that is not a single movement: totals, averages,
 * budgets. A sum mixes rows and has no currency of its own; today every row is
 * COP, so the sum is too. (Phase 6.4 added `transactions.currency`; a movement
 * is formatted with its own.)
 */
export const DEFAULT_CURRENCY = 'COP';

interface MoneyFormatters {
  whole: Intl.NumberFormat;
  withCents: Intl.NumberFormat;
}

/** One pair of formatters per currency, built on first use: Intl formatters are costly to create. */
const formattersByCurrency = new Map<string, MoneyFormatters>();

function formattersFor(currency: string): MoneyFormatters {
  let formatters = formattersByCurrency.get(currency);
  if (!formatters) {
    const options = { style: 'currency', currency } as const;
    formatters = {
      whole: new Intl.NumberFormat('es-CO', { ...options, minimumFractionDigits: 0, maximumFractionDigits: 0 }),
      withCents: new Intl.NumberFormat('es-CO', { ...options, minimumFractionDigits: 2, maximumFractionDigits: 2 }),
    };
    formattersByCurrency.set(currency, formatters);
  }
  return formatters;
}

/**
 * Formatea un monto para MOSTRAR.
 *
 * Recibe el string decimal que entrega la API. Se convierte a número solo aquí,
 * en el borde de presentación: nunca se hace aritmética de dinero con el
 * resultado. Los centavos se ocultan cuando son `.00`, que es el caso normal
 * en COP.
 */
/**
 * Agrupa los miles mientras se escribe una cifra.
 *
 * ── Por qué no `formatCOP` ──────────────────────────────────────────────────
 * Porque `formatCOP` formatea un NÚMERO ya escrito y aquí lo que hay es un
 * texto a medias. «1234,» no es un número —`Number` lo redondea o lo rechaza—
 * y borrar la coma que alguien acaba de teclear es la forma más rápida de que
 * un campo se vuelva imposible de usar. Esto solo mira el texto: separa por la
 * coma, agrupa la parte de la izquierda y devuelve la derecha tal cual.
 *
 * Con punto de miles y coma decimal, que es como se escribe el dinero en
 * Colombia y como lo devuelve `formatCOP`: si el campo se escribiera con
 * comas, la misma cifra tendría dos formas según se estuviera leyendo o
 * escribiendo.
 */
export function agruparMiles(crudo: string): string {
  const [enteros = '', ...decimales] = crudo.split(',');
  const agrupados = enteros.replace(/\B(?=(\d{3})+(?!\d))/g, '.');

  // La coma se conserva aunque todavía no haya decimales: quien acaba de
  // escribirla está a punto de escribirlos.
  return decimales.length > 0 ? `${agrupados},${decimales.join('')}` : agrupados;
}

/**
 * Lo que queda de lo tecleado: dígitos y una sola coma.
 *
 * Es lo que se GUARDA, y de ahí sale el número que se manda a la API. Quitar
 * aquí los puntos —y no al enviar— evita que el valor viva en dos formas según
 * quién lo mire.
 */
export function soloCifras(escrito: string): string {
  const limpio = escrito.replace(/[^\d,]/g, '');
  const [enteros = '', ...resto] = limpio.split(',');

  // Dos comas no son un número. Se queda la primera y lo demás se pega detrás.
  return resto.length > 0 ? `${enteros},${resto.join('')}` : enteros;
}

/**
 * Formats an amount for DISPLAY in the given currency. Cents are hidden when
 * they are `.00`, which is the normal case in COP.
 */
export function formatMoney(amount: string | number, currency: string = DEFAULT_CURRENCY): string {
  const value = typeof amount === 'string' ? Number.parseFloat(amount) : amount;
  if (!Number.isFinite(value)) return '—';

  const { whole, withCents } = formattersFor(currency);
  const hasCents = Math.round(value * 100) % 100 !== 0;
  return (hasCents ? withCents : whole).format(value);
}

/** An aggregate —no row of its own— in the default currency. */
export function formatCOP(amount: string | number): string {
  return formatMoney(amount, DEFAULT_CURRENCY);
}

/**
 * Pesos en corto: `$93,3 M`, `$1,2 k`.
 *
 * Para sitios donde la cifra exacta no cabe ni hace falta —el centro de una
 * dona de 120 píxeles—. `$ 93.260.516` ahí dentro se sale o hay que encogerlo
 * hasta que no se lea.
 */
export function formatCOPCorto(amount: string | number): string {
  const value = typeof amount === 'string' ? Number.parseFloat(amount) : amount;
  if (!Number.isFinite(value)) return '—';

  const unidades: { desde: number; sufijo: string }[] = [
    { desde: 1_000_000_000, sufijo: ' MM' },
    { desde: 1_000_000, sufijo: ' M' },
    { desde: 1_000, sufijo: ' k' },
  ];

  for (const { desde, sufijo } of unidades) {
    if (Math.abs(value) >= desde) {
      const corto = value / desde;
      // Un decimal solo mientras aporte: "93,3 M" sí, "93,0 M" no.
      const texto = corto.toLocaleString('es-CO', {
        minimumFractionDigits: 0,
        maximumFractionDigits: Math.abs(corto) < 100 ? 1 : 0,
      });
      return `$${texto}${sufijo}`;
    }
  }

  return formatCOP(value);
}
