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
  const fuente = readFileSync(join(__dirname, 'supabase-auth.service.ts'), 'utf8');

  it('la comprobación está dentro de `llamar`', () => {
    const cuerpoDeLlamar = fuente.slice(fuente.indexOf('private async llamar('));
    const hastaElSiguienteMetodo = cuerpoDeLlamar.slice(
      0,
      cuerpoDeLlamar.indexOf('\n  private aSesion'),
    );

    expect(hastaElSiguienteMetodo).toContain("ruta.startsWith('/admin/')");
    expect(hastaElSiguienteMetodo).toContain('whyNotTouchRealAccounts');
  });

  it('y se comprueba ANTES de llamar a la red', () => {
    // Si el `fetch` fuera primero, el candado solo serviría para ocultar la
    // respuesta de una operación que ya ocurrió.
    expect(fuente.indexOf('whyNotTouchRealAccounts')).toBeLessThan(fuente.indexOf('await fetch('));
  });

  it('no hay ningún `fetch` fuera de `llamar`', () => {
    // El candado vale lo que valga este invariante: un segundo sitio que
    // hablara con GoTrue por su cuenta pasaría por encima sin enterarse.
    const veces = fuente.match(/fetch\(/g) ?? [];
    expect(veces).toHaveLength(1);
  });

  it('las cuatro operaciones peligrosas siguen yendo por `/admin/`', () => {
    // Si alguna dejara de usar ese prefijo, saldría del candado en silencio.
    for (const metodo of [
      'cerrarTodasLasSesiones',
      'crearUsuario',
      'cambiarContrasena',
      'eliminarUsuario',
    ]) {
      const desde = fuente.indexOf(`async ${metodo}(`);
      expect(desde).toBeGreaterThan(-1);
      const cuerpo = fuente.slice(desde, desde + 600);
      expect(cuerpo).toContain('/admin/');
      expect(cuerpo).toContain('this.serviceKey');
    }
  });

  it('entrar y refrescar NO pasan por el candado', () => {
    // Si entrar quedara bloqueado, la aplicación no se podría usar en local, y
    // el candado habría cambiado un riesgo por una obstrucción.
    for (const metodo of ['entrar', 'refrescar']) {
      const desde = fuente.indexOf(`async ${metodo}(`);
      const cuerpo = fuente.slice(desde, desde + 500);
      expect(cuerpo).not.toContain('/admin/');
    }
  });
});
