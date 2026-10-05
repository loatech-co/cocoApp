#!/usr/bin/env node
//
// Deja la base LOCAL con datos con los que se pueda trabajar.
//
// ── Por qué hace falta ───────────────────────────────────────────────────────
// Hasta ahora `api/.env` apuntaba a Supabase, así que «tener datos» en
// desarrollo salía gratis: eran los de verdad. Al separar los dos entornos esa
// comodidad desaparece, y una base vacía no sirve para probar nada —ni los
// pagos pendientes, ni el presupuesto, ni la dona—.
//
// ── Es IDEMPOTENTE ───────────────────────────────────────────────────────────
// Se puede correr las veces que haga falta: busca por nombre antes de crear y
// no duplica. Eso importa porque va a correrse después de cada `migrate reset`,
// y un script de siembra que al repetirse deja dos «Mercado» obliga a limpiar a
// mano justo cuando uno quería empezar limpio.
//
// ── Y se niega a salir de esta máquina ───────────────────────────────────────
// Siembra escribe. Apuntado a una base remota por un `.env` heredado, metería
// categorías inventadas en los datos de alguien. La comprobación es la misma
// que la del arranque de la API, y por el mismo motivo.
import { createPrisma } from './db/prisma-client.mjs';

const HOSTS_LOCALES = new Set(['localhost', '127.0.0.1', '::1', '0.0.0.0']);

const url = process.env.DATABASE_URL ?? '';
const host = (() => {
  try {
    return new URL(url).hostname;
  } catch {
    return '';
  }
})();

if (!HOSTS_LOCALES.has(host)) {
  console.error(
    `Esto siembra datos, y DATABASE_URL apunta a «${host || '(ilegible)'}», que no es tu máquina.\n` +
      `Corré el script con el entorno local:\n\n  npm run sembrar:local\n`,
  );
  process.exit(1);
}

const prisma = createPrisma();

/** Busca por nombre dentro de un padre, y lo crea si no está. */
async function asegurar(userId, parentId, name, datos = {}) {
  const existente = await prisma.category.findFirst({ where: { userId, parentId, name } });
  if (existente) {
    // Si ya está pero le falta lo que esto viene a poner, se completa. Correr
    // la siembra sobre una base a medias tiene que dejarla entera.
    const faltantes = Object.fromEntries(
      Object.entries(datos).filter(([k, v]) => String(existente[k] ?? '') !== String(v ?? '')),
    );
    if (Object.keys(faltantes).length === 0) return { fila: existente, nuevo: false };
    return {
      fila: await prisma.category.update({ where: { id: existente.id }, data: faltantes }),
      nuevo: false,
      ajustado: Object.keys(faltantes),
    };
  }
  return {
    fila: await prisma.category.create({ data: { userId, parentId, name, ...datos } }),
    nuevo: true,
  };
}

const usuario = await prisma.user.findFirst({ orderBy: { id: 'asc' } });
if (!usuario) {
  console.error(
    'No hay ningún usuario en la base local.\n\n' +
      'Registrate una vez desde la aplicación: el registro siembra solo la\n' +
      'plantilla de centros de costos. Después volvé a correr esto.',
  );
  process.exit(1);
}
const userId = usuario.id;
const hechos = [];

// ── La plantilla, por si la base nació antes que ella ───────────────────────
const fijos = await asegurar(userId, null, 'Costos fijos', { estatico: true });
const variables = await asegurar(userId, null, 'Costos variables', { estatico: false });
for (const [padre, hijos] of [
  [fijos, ['Educación', 'Vivienda', 'Familia', 'Salud y vida', 'Servicios públicos', 'Vehículos']],
  [variables, ['Licencias']],
]) {
  for (const nombre of hijos) {
    const r = await asegurar(userId, padre.fila.id, nombre);
    if (r.nuevo) hechos.push(`categoría «${nombre}»`);
  }
}

// ── Un concepto recurrente CON presupuesto ──────────────────────────────────
// Mercado y no otro: es el caso que de verdad distingue el presupuesto del
// promedio. Un alquiler vale lo mismo todos los meses, así que promediarlo
// acierta por accidente; el mercado se paga en varias idas de valor distinto,
// y ahí el promedio de los tres meses anteriores no dice nada útil.
const alimentacion = await asegurar(userId, variables.fila.id, 'Alimentación', {
  icon: 'utensils',
});
if (alimentacion.nuevo) hechos.push('categoría «Alimentación»');

const mercado = await asegurar(userId, alimentacion.fila.id, 'Mercado', {
  recurrente: true,
  periodicidad: 'mensual',
  diaDePago: 1,
  presupuesto: '1200000',
  // Marcado, que es lo que lo hace útil para probar: con las dos idas de
  // abajo queda pagado en parte, que es el estado donde se ve si las cifras
  // del mes cuadran.
  variosPagos: true,
  icon: 'shopping-cart',
});
if (mercado.nuevo) hechos.push('concepto «Mercado» con presupuesto');
else if (mercado.ajustado) hechos.push(`«Mercado» completado: ${mercado.ajustado.join(', ')}`);

// ── Dos idas al mercado este mes ────────────────────────────────────────────
// Para que el concepto no esté solo presente sino VIVO: pagado en parte, que
// es el estado en el que de verdad se ve si las cifras del mes cuadran.
//
// `external_ref` lleva la marca `siembra:` por la misma razón que existe para
// los cobros automáticos: es la llave con la que esto se reconoce a sí mismo al
// repetirse, y de paso deja dicho en la fila que el dato no lo escribió nadie.
const primeroDelMes = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1));
const idas = [
  { dia: 3, monto: '320450', donde: 'Supermercado (siembra)' },
  { dia: 14, monto: '287900', donde: 'Supermercado (siembra)' },
];
for (const { dia, monto, donde } of idas) {
  const ref = `siembra:mercado:${primeroDelMes.toISOString().slice(0, 7)}:${dia}`;
  const ya = await prisma.transaction.findFirst({ where: { userId, externalRef: ref } });
  if (ya) continue;
  const fecha = new Date(primeroDelMes);
  fecha.setUTCDate(dia);
  await prisma.transaction.create({
    data: {
      userId,
      categoryId: mercado.fila.id,
      date: fecha,
      period: primeroDelMes,
      amount: monto,
      type: 'expense',
      status: 'cleared',
      description: donde,
      externalRef: ref,
    },
  });
  hechos.push(`movimiento de Mercado del día ${dia}`);
}

const conteo = {
  usuarios: await prisma.user.count(),
  'centros de costos': await prisma.category.count({ where: { parentId: null } }),
  'conceptos recurrentes': await prisma.category.count({ where: { recurrente: true } }),
  'con presupuesto': await prisma.category.count({ where: { presupuesto: { not: null } } }),
  movimientos: await prisma.transaction.count(),
};

console.log(
  hechos.length ? `Sembrado:\n  · ${hechos.join('\n  · ')}` : 'Ya estaba todo. Nada que hacer.',
);
console.log(`\nLa base local queda así:`);
for (const [que, cuantos] of Object.entries(conteo))
  console.log(`  ${String(cuantos).padStart(5)}  ${que}`);

await prisma.$disconnect();
