import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** Composes Tailwind classes resolving conflicts (the last one wins). */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

/**
 * Groups the thousands while a figure is being typed.
 *
 * ── Why not `formatCOP` ─────────────────────────────────────────────────────
 * Because `formatCOP` formats a NUMBER already written and what there is here
 * is a half-typed text. «1234,» is not a number —`Number` rounds or rejects
 * it— and deleting the comma someone just typed is the fastest way to make a
 * field impossible to use. This only looks at the text: it splits at the
 * comma, groups the left part and returns the right part as is.
 *
 * With a thousands dot and a decimal comma, which is how money is written in
 * Colombia and how `formatCOP` returns it: if the field were typed with
 * commas, the same figure would have two forms depending on whether it was
 * being read or typed.
 */
export function groupThousands(raw: string): string {
  const [integerPart = '', ...decimalParts] = raw.split(',');
  const grouped = integerPart.replace(/\B(?=(\d{3})+(?!\d))/g, '.');

  // The comma is kept even when there are no decimals yet: whoever just
  // typed it is about to type them.
  return decimalParts.length > 0 ? `${grouped},${decimalParts.join('')}` : grouped;
}

/**
 * What is left of what was typed: digits and a single comma.
 *
 * It is what gets SAVED, and the number sent to the API comes from it.
 * Removing the dots here —and not on sending— keeps the value from living in
 * two forms depending on who looks at it.
 */
export function digitsOnly(typed: string): string {
  const clean = typed.replace(/[^\d,]/g, '');
  const [integerPart = '', ...rest] = clean.split(',');

  // Two commas are not a number. The first stays and the rest is appended after it.
  return rest.length > 0 ? `${integerPart},${rest.join('')}` : integerPart;
}

/**
 * An amount as the API writes it (`'45000.50'`) turned into what the money
 * field understands: digits and a decimal COMMA, without the `.00` that
 * nobody typed.
 *
 * The field keeps digits and commas only: handed `'45000.5'` it painted
 * «450.005» and the first keystroke saved a value a hundred times larger.
 */
export function typedAmount(amount: string): string {
  const [integerPart = '', cents = ''] = amount.split('.');
  return /^0*$/.test(cents) ? integerPart : `${integerPart},${cents}`;
}
