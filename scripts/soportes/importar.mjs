#!/usr/bin/env node
//
// Mete los soportes escaneados en el almacén privado y los ata a su movimiento.
//
// Uso:
//   node scripts/soportes/importar.mjs "<carpeta>" --correo hello@viteri.me [opciones]
//
//   --ensayo         no escribe nada: dice qué haría
//   --limite N       solo los primeros N movimientos (el lote de prueba)
//   --almacen RUTA   dónde dejar los binarios (por defecto api/.soportes)
//   --csv RUTA       el CSV canónico (por defecto $COCO_DATA_DIR/datos/Gastos_Consolidado.csv)
//
// ── Idempotente y reanudable ────────────────────────────────────────────────
// La huella de cada soporte es el sha256 de SU CONTENIDO, y la base tiene un
// único sobre (movimiento, huella). Volver a correr esto no duplica nada, y si
// se corta a la mitad, la segunda pasada sigue donde iba. No hace falta llevar
// la cuenta de por dónde se quedó: la base ya la lleva.
//
// ── Qué pasa si se corta entre el archivo y la fila ─────────────────────────
// Queda un binario sin ficha. No es bonito, pero es inofensivo: sin fila, no
// hay endpoint que lo encuentre ni ruta que lo alcance, y la siguiente pasada
// escribe uno nuevo con su ficha. El orden contrario —fila primero— dejaría un
// soporte que la aplicación promete y no puede enseñar, que es peor.
//
// ── Los originales no se tocan ──────────────────────────────────────────────
// Se leen y ya. Ni se mueven, ni se renombran, ni se borran.
import { createHash, randomUUID } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

import { PrismaClient } from '@prisma/client';

import { DEFAULT_CSV } from '../data-dir.mjs';
import { emparejar, leerArchivos, leerCsv, TIPOS } from './emparejar.mjs';

const args = process.argv.slice(2);
const raiz = args.find((a) => !a.startsWith('--'));
const ensayo = args.includes('--ensayo');
const bandera = (nombre) => {
  const i = args.indexOf(nombre);
  return i >= 0 ? args[i + 1] : undefined;
};

const correo = bandera('--correo') ?? process.env.BOOTSTRAP_ADMIN_EMAIL;
const limite = bandera('--limite') ? Number(bandera('--limite')) : Infinity;
const csv = bandera('--csv') ?? DEFAULT_CSV;
const almacen = resolve(bandera('--almacen') ?? 'api/.soportes');

if (!raiz) {
  console.error(
    'Uso: node scripts/soportes/importar.mjs "<carpeta>" --correo <correo> [--ensayo] [--limite N]',
  );
  process.exit(1);
}

/*
  La convención de la clave la manda `api/src/modules/soportes/soportes.almacen.ts`.
  Se repite aquí porque este script es .mjs y aquel es TypeScript; si allá
  cambia, aquí también. Son tres líneas y no tienen ninguna gracia, pero el día
  que se separen los archivos dejan de encontrarse.
*/
const claveNueva = (userId, ext) => `${userId}/${randomUUID()}.${ext.toLowerCase()}`;
const huellaDe = (contenido) => createHash('sha256').update(contenido).digest('hex');

const prisma = new PrismaClient();

try {
  const usuario = await prisma.user.findFirst({
    where: correo ? { email: correo.toLowerCase() } : {},
    orderBy: { id: 'asc' },
  });
  if (!usuario) throw new Error(`No encontré al usuario ${correo ?? '(el primero)'}.`);

  const filas = leerCsv(csv);
  const { archivos, ilegibles } = leerArchivos(raiz);
  const { casados, ambiguos, huerfanos } = emparejar(archivos, filas);

  console.log(`\n▸ ${usuario.email}`);
  console.log(`  almacén: ${almacen}${ensayo ? '  (ENSAYO: no se escribe)' : ''}`);
  console.log(
    `  ${casados.length} movimientos casados · ${ambiguos.length} ambiguos · ${huerfanos.length} sin match · ${ilegibles.length} ilegibles\n`,
  );

  // Lo ambiguo y lo huérfano NO se tocan. Están en el reporte para mirarlos a
  // mano, y meterlos "por si acaso" es justo lo que convierte un archivo mal
  // nombrado en el recibo de otro pago.
  const tanda = casados.slice(0, limite);
  if (tanda.length < casados.length) {
    console.log(`  Lote de prueba: ${tanda.length} de ${casados.length} movimientos.\n`);
  }

  /*
    Dos consultas, no ochocientas.

    La primera versión buscaba el movimiento de cada grupo y, dentro, cada
    soporte ya existente: 377 + 443 viajes contra una base que está en otro
    continente. Tardaba más de dos minutos en no hacer nada. Los movimientos
    del usuario caben de sobra en memoria —son cientos, no millones— así que se
    traen de una vez y se indexan por huella.
  */
  const movimientos = await prisma.transaction.findMany({
    where: { userId: usuario.id, externalRef: { not: null } },
    select: { id: true, externalRef: true },
  });
  const movimientoDe = new Map(movimientos.map((m) => [m.externalRef, m]));

  const existentes = await prisma.soporte.findMany({
    where: { userId: usuario.id },
    select: { transactionId: true, huella: true },
  });
  const yaHay = new Set(existentes.map((s) => `${s.transactionId}|${s.huella}`));

  let creados = 0;
  let yaEstaban = 0;
  let sinMovimiento = 0;
  const perdidos = [];

  for (const grupo of tanda) {
    // El movimiento se encuentra por la MISMA huella que escribió el cargador.
    const movimiento = movimientoDe.get(grupo.fila.huella);

    if (!movimiento) {
      sinMovimiento += 1;
      perdidos.push(`${grupo.fila.periodo} · ${grupo.fila.fecha} · ${grupo.fila.concepto}`);
      continue;
    }

    for (const archivo of grupo.archivos) {
      const contenido = readFileSync(archivo.ruta);
      const huella = huellaDe(contenido);

      const clave = `${movimiento.id}|${huella}`;
      if (yaHay.has(clave)) {
        yaEstaban += 1;
        continue;
      }
      // Se apunta enseguida: dos archivos idénticos del mismo movimiento son
      // el mismo soporte, y sin esto el segundo chocaría contra el único.
      yaHay.add(clave);

      const storageKey = claveNueva(usuario.id.toString(), archivo.ext);

      if (!ensayo) {
        const destino = resolve(almacen, storageKey);
        await mkdir(dirname(destino), { recursive: true });
        // `wx` falla si ya existe. Con un uuid recién hecho no debería pasar
        // nunca; que falle ruidosamente si pasa es mejor que pisar un recibo.
        await writeFile(destino, contenido, { flag: 'wx' });

        await prisma.soporte.create({
          data: {
            userId: usuario.id,
            transactionId: movimiento.id,
            orden: archivo.orden,
            nombreArchivo: archivo.nombre,
            mimeType: TIPOS[archivo.ext],
            storageKey,
            tamano: contenido.length,
            huella,
          },
        });
      }

      creados += 1;
    }
  }

  console.log(`${ensayo ? '(ENSAYO) ' : ''}Listo.`);
  console.log(`  ${creados} soportes ${ensayo ? 'se crearían' : 'creados'}`);
  console.log(`  ${yaEstaban} ya estaban`);
  if (sinMovimiento > 0) {
    console.log(`  ${sinMovimiento} grupos sin movimiento en la base:`);
    for (const p of perdidos.slice(0, 10)) console.log(`    ${p}`);
    if (perdidos.length > 10) console.log(`    … y ${perdidos.length - 10} más`);
  }

  if (!ensayo && existsSync(almacen)) {
    console.log(`\n  Los binarios están en ${almacen}.`);
    console.log('  Para producción, sincronízalos con el almacén del servidor.');
  }
} finally {
  await prisma.$disconnect();
}
