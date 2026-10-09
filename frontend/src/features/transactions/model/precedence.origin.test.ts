import { describe, expect, it } from 'vitest';

import { originName } from './precedence';

describe('originName', () => {
  it('names each source the way the sheet shows it', () => {
    expect(originName('manual')).toBe('elegido');
    expect(originName('historial')).toBe('sugerido por tu historial');
    expect(originName('palabras-clave')).toBe('sugerido por tus palabras clave');
    expect(originName('diccionario')).toBe('sugerido por el comercio');
  });
});
