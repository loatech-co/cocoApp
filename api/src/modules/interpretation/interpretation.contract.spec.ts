import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * `CapturaRequest`, in `frontend/src/shared/lib/native-contract.ts`, mirrors
 * `CaptureBodyDto`. They must have the SAME keys: the ValidationPipe runs with
 * `forbidNonWhitelisted`, so a field the phone sends and the DTO does not
 * declare is a 400 —and the queue would mark it failed forever—; and one the
 * DTO accepts and the contract does not publish is a field no client ever
 * uses.
 *
 * It is checked by reading the source of both sides, as
 * `receipts.contract.spec.ts` does: the API imports no values from
 * `frontend/src/shared/lib/native-contract.ts` at run time —they are types—
 * and a decorated DTO cannot be walked by reflection without instantiating
 * it with data.
 */
describe('The capture contract', () => {
  const nativeContract = readFileSync(
    join(__dirname, '../../../../frontend/src/shared/lib/native-contract.ts'),
    'utf8',
  );
  const dto = readFileSync(join(__dirname, 'interpretation.dto.ts'), 'utf8');

  /** The body between braces of the first declaration that starts like this. */
  const bodyOf = (source: string, header: RegExp): string => {
    const m = header.exec(source);
    if (!m) throw new Error(`No encontré ${String(header)}`);
    const start = source.indexOf('{', m.index);
    return source.slice(start + 1, source.indexOf('\n}', start));
  };

  /** The property names: the word at the start of a line followed by `?:`, `!:` or `:`. */
  const keysOf = (body: string): Set<string> =>
    new Set([...body.matchAll(/^\s+([a-z_]+)[?!]?:/gm)].map((m) => m[1]!));

  it('CaptureBodyDto and CapturaRequest have exactly the same keys', () => {
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

    // That the read found something: a regex that does not match would give two equal empties.
    expect(fromDto.has('external_ref')).toBe(true);
    expect(fromDto.has('category_id')).toBe(true);
    expect([...fromDto].sort()).toEqual([...fromContract].sort());
  });
});
