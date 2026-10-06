import { describe, expect, it } from 'vitest';

import { groupThousands, digitsOnly } from './utils';

/**
 * The value field is typed with the dots in place.
 *
 * «453132» cannot be read: you have to count the digits in threes to know
 * whether it is four hundred thousand or four million, and it is the most
 * important figure on the sheet. What is tested here is that grouping does
 * not get in the way while typing: a half-typed figure has to survive, and so
 * does the decimal comma.
 */
describe('Grouping the thousands', () => {
  it.each([
    ['0', '0'],
    ['1', '1'],
    ['123', '123'],
    ['1234', '1.234'],
    ['453132', '453.132'],
    ['1504200', '1.504.200'],
    ['1234567890', '1.234.567.890'],
  ])('«%s» is written «%s»', (raw, typed) => {
    expect(groupThousands(raw)).toBe(typed);
  });

  it('the decimal comma is respected, even half-typed', () => {
    // Deleting the comma someone just typed is the fastest way to make a
    // field impossible to use.
    expect(groupThousands('1234,')).toBe('1.234,');
    expect(groupThousands('1234,5')).toBe('1.234,5');
    expect(groupThousands('1234,50')).toBe('1.234,50');
  });

  it('empty stays empty', () => {
    expect(groupThousands('')).toBe('');
  });
});

describe('What is kept of what was typed', () => {
  it('keeps the digits and removes the dots', () => {
    expect(digitsOnly('1.504.200')).toBe('1504200');
    expect(digitsOnly('$ 453.132')).toBe('453132');
    expect(digitsOnly('mil')).toBe('');
  });

  it('a single comma: two are not a number', () => {
    expect(digitsOnly('1234,5')).toBe('1234,5');
    expect(digitsOnly('1,2,3')).toBe('1,23');
  });

  it('what is kept can be grouped again without losing anything', () => {
    // The round trip is what guarantees the value does not transform on its
    // own when it passes through the field.
    for (const typed of ['1.504.200', '453.132', '1.234,50']) {
      expect(groupThousands(digitsOnly(typed))).toBe(typed);
    }
  });
});
