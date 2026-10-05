import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * El contrato de soportes que publica `@coco/types` tiene que decir lo mismo
 * que hace la API. Se comprueba leyendo el código fuente de los dos lados: la
 * API no importa valores de `@coco/types` en tiempo de ejecución —son tipos—,
 * así que esta es la única forma de que un cambio de límite aquí no deje al
 * cliente del teléfono con un contrato viejo.
 */
describe('El contrato de soportes', () => {
  const tipos = readFileSync(join(__dirname, '../../../../packages/types/src/index.ts'), 'utf8');
  const controlador = readFileSync(join(__dirname, 'soportes.controller.ts'), 'utf8');
  const optimizacion = readFileSync(join(__dirname, 'soportes.optimizacion.ts'), 'utf8');
  const almacen = readFileSync(join(__dirname, 'soportes.almacen.ts'), 'utf8');
  const encoger = readFileSync(
    join(__dirname, '../../../../frontend/src/lib/encoger-soporte.ts'),
    'utf8',
  );

  const contrato = tipos.slice(tipos.indexOf('export const CONTRATO_DE_SOPORTES'));
  const numero = (fuente: string, patron: RegExp): number => {
    const m = patron.exec(fuente);
    if (!m) throw new Error(`No encontré ${String(patron)}`);
    // Aritmética de constantes del propio repo (`25 * 1024 * 1024`), no entrada externa.
    return Number(eval(m[1].replace(/_/g, '')));
  };

  it('el campo y el máximo por subida son los del controlador', () => {
    expect(controlador).toContain("FilesInterceptor('archivos', MAXIMO_POR_SUBIDA");
    expect(contrato).toContain("campo: 'archivos'");
    expect(numero(contrato, /maximo_por_subida:\s*(\d+)/)).toBe(
      numero(controlador, /MAXIMO_POR_SUBIDA = ([^;]+);/),
    );
  });

  it('el tamaño máximo es el que aplica la API', () => {
    expect(numero(contrato, /tamano_maximo_bytes:\s*(\d+)/)).toBe(
      numero(optimizacion, /export const TAMANO_MAXIMO = ([^;]+);/),
    );
  });

  it('los tipos son exactamente los que el almacén acepta', () => {
    const delAlmacen = [...almacen.matchAll(/'(application\/pdf|image\/[a-z]+)'/g)].map(
      (m) => m[1],
    );
    const delContrato = [...contrato.matchAll(/'(application\/pdf|image\/[a-z]+)'/g)].map(
      (m) => m[1],
    );
    expect(new Set(delContrato)).toEqual(new Set(delAlmacen));
  });

  it('lo recomendado es lo que hace la web antes de subir', () => {
    expect(numero(contrato, /lado_maximo_px:\s*(\d+)/)).toBe(
      numero(encoger, /const ANCHO_MAXIMO = ([^;]+);/),
    );
    expect(numero(contrato, /calidad:\s*([\d.]+)/)).toBe(
      numero(encoger, /const CALIDAD = ([^;]+);/),
    );
  });
});
