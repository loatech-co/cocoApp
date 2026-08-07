#!/usr/bin/env node
/**
 * Deja los recursos de Tesseract servidos desde nuestro propio origen.
 *
 * ── El problema que resuelve ────────────────────────────────────────────────
 * Por defecto, `tesseract.js` descarga su worker, su motor WASM y los datos del
 * idioma desde `cdn.jsdelivr.net` EN TIEMPO DE EJECUCIÓN. Para una app de
 * finanzas eso tiene tres inconvenientes, en orden de gravedad:
 *
 *   1. Se ejecutaría en el navegador del usuario un binario WASM traído de un
 *      tercero, sin pasar por el lockfile ni por ninguna verificación nuestra.
 *   2. Importar un extracto dejaría de funcionar si ese CDN falla.
 *   3. Una CSP estricta en el sitio desplegado lo bloquearía.
 *
 * Lo que hace este script: copia el worker y el motor DESDE node_modules —donde
 * ya llegaron verificados por package-lock.json— y descarga los datos del
 * idioma español desde el repositorio oficial de Tesseract, una sola vez, en
 * tiempo de compilación. En ejecución no se sale a ninguna parte.
 *
 * La salida va a `frontend/public/tesseract/`, que está en .gitignore: son
 * artefactos reproducibles, no fuente.
 */
import { createWriteStream } from 'node:fs';
import { cp, mkdir, stat } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';
import { Readable } from 'node:stream';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const DESTINO = join(RAIZ, 'frontend', 'public', 'tesseract');

/**
 * Datos del idioma, del repositorio oficial de Tesseract.
 *
 * `tessdata_fast` y no `tessdata_best`: es cuatro veces más pequeño y bastante
 * más rápido, y sobre el texto impreso y regular de un extracto bancario la
 * diferencia de precisión es marginal. Para letra manuscrita no serviría, pero
 * aquí no hay ninguna.
 */
const IDIOMA = 'spa';
const URL_IDIOMA = `https://raw.githubusercontent.com/tesseract-ocr/tessdata_fast/main/${IDIOMA}.traineddata`;

/**
 * Variantes del motor que hay que copiar. TRES, no las veinticuatro que trae
 * el paquete (50 MB).
 *
 * Se leyó el propio `worker.min.js` para saber cuáles pide de verdad: elige
 * entre `relaxedsimd`, `simd` y la básica según lo que soporte el navegador, y
 * añade el sufijo `-lstm` cuando los datos del idioma son solo LSTM — que es
 * exactamente el caso de `tessdata_fast`, el que se descarga aquí abajo.
 *
 * Son 11 MB en disco, de los que cada navegador baja UNO (3,7 MB). Si algún
 * día se cambiara a `tessdata_best`, que incluye el motor heredado, habría que
 * añadir aquí las variantes sin `-lstm` o daría 404.
 */
const VARIANTES_DEL_MOTOR = [
  'tesseract-core-relaxedsimd-lstm.wasm.js',
  'tesseract-core-simd-lstm.wasm.js',
  'tesseract-core-lstm.wasm.js',
];

async function existe(ruta) {
  try {
    await stat(ruta);
    return true;
  } catch {
    return false;
  }
}

async function main() {
  await mkdir(join(DESTINO, 'core'), { recursive: true });
  await mkdir(join(DESTINO, 'lang'), { recursive: true });

  // El worker y el motor vienen de node_modules: ya los verificó el lockfile.
  await cp(
    join(RAIZ, 'node_modules', 'tesseract.js', 'dist', 'worker.min.js'),
    join(DESTINO, 'worker.min.js'),
  );

  for (const variante of VARIANTES_DEL_MOTOR) {
    await cp(
      join(RAIZ, 'node_modules', 'tesseract.js-core', variante),
      join(DESTINO, 'core', variante),
    );
  }
  console.log(`✓ worker y ${VARIANTES_DEL_MOTOR.length} variantes del motor, desde node_modules`);

  // Los datos del idioma no vienen en ningún paquete: hay que traerlos.
  const destinoIdioma = join(DESTINO, 'lang', `${IDIOMA}.traineddata`);
  if (await existe(destinoIdioma)) {
    console.log(`✓ ${IDIOMA}.traineddata ya estaba`);
    return;
  }

  console.log(`Descargando ${IDIOMA}.traineddata…`);
  const respuesta = await fetch(URL_IDIOMA);
  if (!respuesta.ok || !respuesta.body) {
    throw new Error(`No se pudo descargar el idioma: HTTP ${respuesta.status}`);
  }

  await pipeline(Readable.fromWeb(respuesta.body), createWriteStream(destinoIdioma));

  const { size } = await stat(destinoIdioma);
  console.log(`✓ ${IDIOMA}.traineddata (${(size / 1024 / 1024).toFixed(1)} MB)`);
}

main().catch((error) => {
  console.error('Falló la preparación de Tesseract:', error.message);
  console.error('Sin esto, el reconocimiento de imágenes no funcionará.');
  process.exit(1);
});
