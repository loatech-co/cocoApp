import { describe, expect, it } from 'vitest';

import { DEFAULT_CURRENCY, formatCOP, formatMoney } from './format';

// Intl separates the symbol with a non-breaking space; compare on plain spaces.
const plain = (text: string): string => text.replace(/\s/g, ' ');

describe('formatMoney', () => {
  it('formats in the currency it is given', () => {
    expect(plain(formatMoney('45900', 'COP'))).toBe('$ 45.900');
    expect(plain(formatMoney('12.5', 'USD'))).toBe('US$ 12,50');
  });

  it('defaults to COP, so nothing changes for rows that are all COP', () => {
    expect(DEFAULT_CURRENCY).toBe('COP');
    expect(formatMoney('1234567')).toBe(formatMoney('1234567', 'COP'));
    expect(formatCOP('1234567')).toBe(formatMoney('1234567', 'COP'));
  });

  it('shows cents only when there are any', () => {
    expect(plain(formatMoney('45900.00', 'COP'))).toBe('$ 45.900');
    expect(plain(formatMoney('45900.50', 'COP'))).toBe('$ 45.900,50');
  });

  it('shows a dash for something that is not a number', () => {
    expect(formatMoney('abc', 'COP')).toBe('—');
  });
});
