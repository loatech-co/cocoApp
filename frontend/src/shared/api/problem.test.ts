import { describe, expect, it } from 'vitest';

import { readProblem } from './problem';

describe('leerProblema', () => {
  it('lee el código, la frase y los campos de un problem+json', () => {
    const body = {
      type: 'https://dev-cocoapp.viteri.me/problems/invalid_fields',
      title: 'Hay campos inválidos',
      status: 400,
      detail: 'Hay campos inválidos en la solicitud.',
      code: 'invalid_fields',
      errors: [{ field: 'splits.0.amount', message: 'El monto no es válido.' }],
    };

    expect(readProblem(body, 'Por defecto.')).toEqual({
      code: 'invalid_fields',
      message: 'Hay campos inválidos en la solicitud.',
      details: [{ field: 'splits.0.amount', message: 'El monto no es válido.' }],
    });
  });

  it('sin campos, la lista va vacía', () => {
    const body = { code: 'splits_unbalanced', detail: 'No cuadra.', status: 422 };
    expect(readProblem(body, 'Por defecto.').details).toEqual([]);
  });

  it('si el cuerpo no es un problema, queda el mensaje por defecto', () => {
    expect(readProblem(null, 'Por defecto.')).toEqual({
      code: 'unknown_error',
      message: 'Por defecto.',
      details: [],
    });
    expect(readProblem('<html>', 'Por defecto.').message).toBe('Por defecto.');
  });
});
