import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * `CapturaRequest`, en `frontend/src/shared/lib/native-contract.ts`, es el espejo de `CaptureBodyDto`. Tienen
 * que tener las MISMAS claves: el ValidationPipe lleva `forbidNonWhitelisted`,
 * así que un campo que el teléfono mande y el DTO no declare es un 400 —y la
 * cola lo marcaría como fallido para siempre—; y uno que el DTO acepte y el
 * contrato no publique es un campo que ningún cliente llega a usar.
 *
 * Se comprueba leyendo el código fuente de los dos lados, como hace
 * `soportes.contrato.spec.ts`: la API no importa valores de `frontend/src/shared/lib/native-contract.ts` en
 * tiempo de ejecución —son tipos— y un DTO con decoradores no se puede
 * recorrer por reflexión sin instanciarlo con datos.
 */
describe('El contrato de captura', () => {
  const nativeContract = readFileSync(
    join(__dirname, '../../../../frontend/src/shared/lib/native-contract.ts'),
    'utf8',
  );
  const dto = readFileSync(join(__dirname, 'interpretation.dto.ts'), 'utf8');

  /** El cuerpo entre llaves de la primera declaración que empiece así. */
  const bodyOf = (source: string, header: RegExp): string => {
    const m = header.exec(source);
    if (!m) throw new Error(`No encontré ${String(header)}`);
    const start = source.indexOf('{', m.index);
    return source.slice(start + 1, source.indexOf('\n}', start));
  };

  /** Los nombres de propiedad: la palabra al inicio de una línea seguida de `?:`, `!:` o `:`. */
  const keysOf = (body: string): Set<string> =>
    new Set([...body.matchAll(/^\s+([a-z_]+)[?!]?:/gm)].map((m) => m[1]!));

  it('CaptureBodyDto y CapturaRequest tienen exactamente las mismas claves', () => {
    const fromDto = new Set([
      ...keysOf(bodyOf(dto, /export class InterpretBodyDto/)),
      ...keysOf(bodyOf(dto, /export class CaptureBodyDto extends InterpretBodyDto/)),
    ]);
    const fromContract = new Set([
      ...keysOf(bodyOf(nativeContract, /export interface InterpretacionRequest/)),
      ...keysOf(
        bodyOf(nativeContract, /export interface CapturaRequest extends InterpretacionRequest/),
      ),
    ]);

    // Que la lectura encontró algo: una regex que no casa daría dos vacíos iguales.
    expect(fromDto.has('external_ref')).toBe(true);
    expect(fromDto.has('category_id')).toBe(true);
    expect([...fromDto].sort()).toEqual([...fromContract].sort());
  });
});
