#!/usr/bin/env node
//
// Ejecuta SQL arbitrario contra la base de Coco. Lectura y escritura.
//
// ── Por qué existe ───────────────────────────────────────────────────────────
// Para inspeccionar y corregir DATOS sin abrir Prisma Studio ni un cliente
// gráfico: ver por qué un saldo no cuadra, contar filas de un lote de
// importación, arreglar una categoría mal asignada.
//
// NO es la vía para cambiar la ESTRUCTURA. Un `CREATE TABLE` escrito aquí
// quedaría fuera de prisma/migrations y del schema.prisma, y la próxima
// migración generada por `migrate diff` intentaría crear la tabla otra vez —
// o peor, borrar la que se creó a mano. La estructura se cambia en
// schema.prisma y se materializa con scripts/nueva-migracion.sh.
//
// ── Por qué no lee las credenciales ──────────────────────────────────────────
// La DATABASE_URL la inyecta `dotenv -e` en el entorno del proceso. Este
// archivo nunca la abre, nunca la imprime y nunca la pasa por la línea de
// comandos, donde quedaría visible en `ps` para cualquier proceso del equipo.
import { PrismaClient } from '@prisma/client';
import { readFileSync } from 'node:fs';

const args = process.argv.slice(2);
const forzar = args.includes('--forzar');
const json = args.includes('--json');
const archivo = args.includes('--archivo');
const resto = args.filter((a) => !a.startsWith('--'));

if (resto.length === 0) {
  console.error(`Uso:
  npm run sql -- "SELECT ..."          ejecuta una sentencia
  npm run sql -- --archivo consulta.sql
  npm run sql -- --json "SELECT ..."   salida en JSON en vez de tabla
  npm run sql -- --forzar "DELETE ..." permite sentencias destructivas`);
  process.exit(1);
}

const sql = (archivo ? readFileSync(resto[0], 'utf8') : resto.join(' ')).trim();

// El seguro no protege de un error de sintaxis, protege de un descuido: un
// DELETE sin WHERE vacía una tabla entera y en MariaDB no hay forma de
// deshacerlo fuera de una transacción. Pedir --forzar obliga a escribirlo a
// propósito.
const destructiva =
  /^\s*(DROP\s+(DATABASE|SCHEMA|TABLE)|TRUNCATE)\b/i.test(sql) ||
  (/^\s*(DELETE|UPDATE)\b/i.test(sql) && !/\bWHERE\b/i.test(sql));

if (destructiva && !forzar) {
  console.error(
    `Sentencia destructiva sin --forzar:\n  ${sql.split('\n')[0]}\n\n` +
      `Si es a propósito, repetila con --forzar.`,
  );
  process.exit(1);
}

// SELECT/SHOW/DESCRIBE devuelven filas; el resto devuelve cuántas tocó.
const devuelveFilas = /^\s*(SELECT|SHOW|DESCRIBE|DESC|EXPLAIN|WITH)\b/i.test(sql);

const prisma = new PrismaClient();

// BigInt no sobrevive a JSON.stringify y Decimal se imprimiría como objeto.
// Ambos aparecen constantemente aquí: los COUNT() son BigInt y todos los
// montos de Coco son Decimal.
const legible = (v) =>
  typeof v === 'bigint' ? Number(v) : v?.constructor?.name === 'Decimal' ? v.toString() : v;

try {
  if (devuelveFilas) {
    const filas = await prisma.$queryRawUnsafe(sql);
    const limpias = filas.map((f) => Object.fromEntries(Object.entries(f).map(([k, v]) => [k, legible(v)])));
    if (json) console.log(JSON.stringify(limpias, null, 2));
    else if (limpias.length === 0) console.log('(sin filas)');
    else console.table(limpias);
    console.log(`${limpias.length} fila(s)`);
  } else {
    const afectadas = await prisma.$executeRawUnsafe(sql);
    console.log(`${afectadas} fila(s) afectadas`);
  }
} catch (e) {
  console.error(`Error de la base: ${e.message.split('\n').slice(-3).join('\n')}`);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
