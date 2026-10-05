// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { cumpleLaPolitica, PoliticaDeContrasena } from './politica-de-contrasena';

afterEach(cleanup);

// Synthetic samples that only exist to hit each requirement.
const COMPLETE = 'Abcdefghij1!';

describe('cumpleLaPolitica', () => {
  it('accepts a password that meets every requirement', () => {
    expect(cumpleLaPolitica(COMPLETE)).toBe(true);
  });

  it.each([
    ['too short', 'Abcdefgh1!'],
    ['without a small letter', 'ABCDEFGHIJ1!'],
    ['without a capital letter', 'abcdefghij1!'],
    ['without a digit', 'Abcdefghijk!'],
    ['without a symbol', 'Abcdefghijk1'],
  ])('rejects a password %s', (_, password) => {
    expect(cumpleLaPolitica(password)).toBe(false);
  });
});

describe('PoliticaDeContrasena', () => {
  it('lists the five requirements under an accessible name', () => {
    render(<PoliticaDeContrasena password="" />);

    const list = screen.getByRole('list', { name: 'Requisitos de la contraseña' });
    expect(within(list).getAllByRole('listitem')).toHaveLength(5);
  });

  it('says in words, not only in colour, which ones are met', () => {
    render(<PoliticaDeContrasena password="abc" />);

    const items = screen.getAllByRole('listitem').map((li) => li.textContent);
    expect(items.filter((t) => t.includes('(cumplido)'))).toHaveLength(1);
    expect(items.filter((t) => t.includes('(pendiente)'))).toHaveLength(4);
  });

  it('marks every requirement as met for a complete password', () => {
    render(<PoliticaDeContrasena password={COMPLETE} />);

    for (const item of screen.getAllByRole('listitem')) {
      expect(item.textContent).toContain('(cumplido)');
    }
  });
});
