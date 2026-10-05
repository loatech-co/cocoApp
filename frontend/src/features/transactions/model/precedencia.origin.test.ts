import { describe, expect, it } from 'vitest';

import { nombreDelOrigen } from './precedencia';

describe('nombreDelOrigen', () => {
  it('names each source the way the sheet shows it', () => {
    expect(nombreDelOrigen('manual')).toBe('elegido');
    expect(nombreDelOrigen('historial')).toBe('sugerido por tu historial');
    expect(nombreDelOrigen('palabras-clave')).toBe('sugerido por tus palabras clave');
    expect(nombreDelOrigen('diccionario')).toBe('sugerido por el comercio');
  });
});
