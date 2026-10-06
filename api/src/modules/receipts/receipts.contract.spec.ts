import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * El contrato de soportes que publica `frontend/src/shared/lib/native-contract.ts` tiene que decir lo mismo
 * que hace la API. Se comprueba leyendo el código fuente de los dos lados: la
 * API no importa valores de `frontend/src/shared/lib/native-contract.ts` en tiempo de ejecución —son tipos—,
 * así que esta es la única forma de que un cambio de límite aquí no deje al
 * cliente del teléfono con un contrato viejo.
 */
describe('El contrato de soportes', () => {
  const nativeContract = readFileSync(
    join(__dirname, '../../../../frontend/src/shared/lib/native-contract.ts'),
    'utf8',
  );
  const controller = readFileSync(join(__dirname, 'receipts.controller.ts'), 'utf8');
  const optimization = readFileSync(join(__dirname, 'receipts.optimization.ts'), 'utf8');
  const storage = readFileSync(join(__dirname, 'receipts.storage.ts'), 'utf8');
  const shrink = readFileSync(
    join(__dirname, '../../../../frontend/src/shared/lib/shrink-receipt.ts'),
    'utf8',
  );

  const contract = nativeContract.slice(
    nativeContract.indexOf('export const CONTRATO_DE_SOPORTES'),
  );
  const numberIn = (source: string, pattern: RegExp): number => {
    const m = pattern.exec(source);
    if (!m) throw new Error(`No encontré ${String(pattern)}`);
    // Aritmética de constantes del propio repo (`25 * 1024 * 1024`), no entrada externa.
    return Number(eval(m[1]!.replace(/_/g, '')));
  };

  it('el campo y el máximo por subida son los del controlador', () => {
    expect(controller).toContain("FilesInterceptor('archivos', MAX_FILES_PER_UPLOAD");
    expect(contract).toContain("campo: 'archivos'");
    expect(numberIn(contract, /maximo_por_subida:\s*(\d+)/)).toBe(
      numberIn(controller, /MAX_FILES_PER_UPLOAD = ([^;]+);/),
    );
  });

  it('el tamaño máximo es el que aplica la API', () => {
    expect(numberIn(contract, /tamano_maximo_bytes:\s*(\d+)/)).toBe(
      numberIn(optimization, /export const MAX_UPLOAD_BYTES = ([^;]+);/),
    );
  });

  it('los tipos son exactamente los que el almacén acepta', () => {
    const fromStorage = [...storage.matchAll(/'(application\/pdf|image\/[a-z]+)'/g)].map(
      (m) => m[1],
    );
    const fromContract = [...contract.matchAll(/'(application\/pdf|image\/[a-z]+)'/g)].map(
      (m) => m[1],
    );
    expect(new Set(fromContract)).toEqual(new Set(fromStorage));
  });

  it('lo recomendado es lo que hace la web antes de subir', () => {
    expect(numberIn(contract, /lado_maximo_px:\s*(\d+)/)).toBe(
      numberIn(shrink, /const MAX_SIDE_PX = ([^;]+);/),
    );
    expect(numberIn(contract, /calidad:\s*([\d.]+)/)).toBe(
      numberIn(shrink, /const QUALITY = ([^;]+);/),
    );
  });
});
