import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * The receipts contract that `frontend/src/shared/lib/native-contract.ts`
 * publishes has to say what the API does. It is checked by reading the source
 * of both sides: the API imports no values from
 * `frontend/src/shared/lib/native-contract.ts` at run time —they are types—,
 * so this is the only way a limit change here does not leave the phone
 * client with a stale contract.
 */
describe('The receipts contract', () => {
  const nativeContract = readFileSync(
    join(__dirname, '../../../../frontend/src/shared/lib/native-contract.ts'),
    'utf8',
  );
  const controller = readFileSync(join(__dirname, 'receipts.v2.controller.ts'), 'utf8');
  const optimization = readFileSync(join(__dirname, 'receipts.optimization.ts'), 'utf8');
  const storage = readFileSync(join(__dirname, 'receipts.storage.ts'), 'utf8');
  const shrink = readFileSync(
    join(__dirname, '../../../../frontend/src/shared/lib/shrink-receipt.ts'),
    'utf8',
  );

  const contract = nativeContract.slice(nativeContract.indexOf('export const RECEIPTS_CONTRACT'));
  const numberIn = (source: string, pattern: RegExp): number => {
    const m = pattern.exec(source);
    if (!m) throw new Error(`No encontré ${String(pattern)}`);
    // Arithmetic on the repo's own constants (`25 * 1024 * 1024`), not external input.
    return Number(eval(m[1]!.replace(/_/g, '')));
  };

  it("the field and the per-upload maximum are the controller's", () => {
    expect(controller).toContain("const FILES_FIELD = 'files';");
    expect(controller).toContain('FilesInterceptor(FILES_FIELD, MAX_PER_UPLOAD');
    expect(contract).toContain("field: 'files'");
    expect(numberIn(contract, /maxPerUpload:\s*(\d+)/)).toBe(
      numberIn(controller, /MAX_PER_UPLOAD = ([^;]+);/),
    );
  });

  it('the maximum size is the one the API enforces', () => {
    expect(numberIn(contract, /maxSizeBytes:\s*(\d+)/)).toBe(
      numberIn(optimization, /export const MAX_UPLOAD_BYTES = ([^;]+);/),
    );
  });

  it('the types are exactly the ones the store accepts', () => {
    const fromStorage = [...storage.matchAll(/'(application\/pdf|image\/[a-z]+)'/g)].map(
      (m) => m[1],
    );
    const fromContract = [...contract.matchAll(/'(application\/pdf|image\/[a-z]+)'/g)].map(
      (m) => m[1],
    );
    expect(new Set(fromContract)).toEqual(new Set(fromStorage));
  });

  it('the recommendation is what the web does before uploading', () => {
    expect(numberIn(contract, /maxSidePx:\s*(\d+)/)).toBe(
      numberIn(shrink, /const MAX_SIDE_PX = ([^;]+);/),
    );
    expect(numberIn(contract, /quality:\s*([\d.]+)/)).toBe(
      numberIn(shrink, /const QUALITY = ([^;]+);/),
    );
  });
});
