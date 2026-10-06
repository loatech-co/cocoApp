import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * El candado de las cuentas reales, comprobado leyendo el código fuente.
 *
 * ── Por qué así y no ejecutándolo ───────────────────────────────────────────
 * `supabase-auth.service.ts` importa `jose`, que se publica solo como ESM, y
 * Jest corre en CommonJS: el archivo no se puede cargar en una prueba. Es el
 * mismo motivo por el que `esCorreoRepetido` vive en un módulo aparte.
 *
 * Leer la fuente parece pobre, pero aquí protege justo lo que hace falta: que
 * el candado siga estando, y que nadie abra un atajo por el que pasar sin él.
 * Es la misma técnica que ya usan `foco.test.ts` y `radio.test.ts`.
 */
describe('El candado de las operaciones de administración', () => {
  const source = readFileSync(join(__dirname, 'supabase-auth.service.ts'), 'utf8');

  it('la comprobación está dentro de `llamar`', () => {
    const callBody = source.slice(source.indexOf('private async call('));
    const untilNextMethod = callBody.slice(0, callBody.indexOf('\n  private toSession'));

    expect(untilNextMethod).toContain("path.startsWith('/admin/')");
    expect(untilNextMethod).toContain('whyNotTouchRealAccounts');
  });

  it('y se comprueba ANTES de llamar a la red', () => {
    // Si el `fetch` fuera primero, el candado solo serviría para ocultar la
    // respuesta de una operación que ya ocurrió.
    expect(source.indexOf('whyNotTouchRealAccounts')).toBeLessThan(source.indexOf('await fetch('));
  });

  it('no hay ningún `fetch` fuera de `llamar`', () => {
    // El candado vale lo que valga este invariante: un segundo sitio que
    // hablara con GoTrue por su cuenta pasaría por encima sin enterarse.
    const calls = source.match(/fetch\(/g) ?? [];
    expect(calls).toHaveLength(1);
  });

  it('las cuatro operaciones peligrosas siguen yendo por `/admin/`', () => {
    // Si alguna dejara de usar ese prefijo, saldría del candado en silencio.
    for (const method of ['signOutEverywhere', 'createUser', 'changePassword', 'deleteUser']) {
      const start = source.indexOf(`async ${method}(`);
      expect(start).toBeGreaterThan(-1);
      const body = source.slice(start, start + 600);
      expect(body).toContain('/admin/');
      expect(body).toContain('this.serviceKey');
    }
  });

  it('entrar y refrescar NO pasan por el candado', () => {
    // Si entrar quedara bloqueado, la aplicación no se podría usar en local, y
    // el candado habría cambiado un riesgo por una obstrucción.
    for (const method of ['signIn', 'refresh']) {
      const start = source.indexOf(`async ${method}(`);
      const body = source.slice(start, start + 500);
      expect(body).not.toContain('/admin/');
    }
  });
});
