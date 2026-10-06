import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** Compone clases de Tailwind resolviendo conflictos (la última gana). */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

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
