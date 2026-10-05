#!/usr/bin/env node
//
// Carga un CSV histórico de gastos, creando el árbol que haga falta.
//
// Uso:  npm run cargar -- <archivo.csv> [--correo hello@viteri.me] [--ensayo]
//
// El CSV trae la jerarquía en columnas —Centro_de_costos, Grupo, Concepto— y
// aquí se convierte en el árbol de tres niveles de la app. Lo que no exista se
// crea; lo que ya exista se reutiliza.
//
// ── Qué fecha se guarda, y por qué ──────────────────────────────────────────
// `Fecha_Pago`, no el par Anio/Mes. Coco es un libro de CAJA: los saldos salen
// de los movimientos, así que la fecha tiene que ser el día en que la plata
// salió de verdad. Usar el mes de devengo dejaría saldos que no cuadran con
// ningún extracto.
//
// Pero el período NO se pierde: va en las notas. En este archivo el 14% de las
// filas tiene un mes distinto al de su pago —la matrícula de febrero pagada el
// 29 de enero, por ejemplo—, y esa diferencia es información, no ruido.
//
// ── Por qué es idempotente ──────────────────────────────────────────────────
// Cada fila lleva una huella estable en `external_ref`. Volver a correr el
// mismo archivo no duplica nada, que es lo que uno quiere cuando la primera
// carga se corta a la mitad.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

import { PrismaClient } from '@prisma/client';

const MESES = {
  enero: 1,
  febrero: 2,
  marzo: 3,
  abril: 4,
  mayo: 5,
  junio: 6,
  julio: 7,
  agosto: 8,
  septiembre: 9,
  octubre: 10,
  noviembre: 11,
  diciembre: 12,
};

const args = process.argv.slice(2);
const archivo = args.find((a) => !a.startsWith('--'));
const ensayo = args.includes('--ensayo');
const correo = valorDe('--correo') ?? process.env.BOOTSTRAP_ADMIN_EMAIL;

if (!archivo) {
  console.error('Uso: npm run cargar -- <archivo.csv> [--correo <correo>] [--ensayo]');
  process.exit(1);
}

function valorDe(bandera) {
  const i = args.indexOf(bandera);
  return i >= 0 ? args[i + 1] : undefined;
}

/**
 * Divide una línea de CSV respetando las comillas.
 *
 * Los conceptos traen paréntesis y barras —"Gases de Occidente (Gas)",
 * "PILA / Seguridad Social"— pero no comas. Aun así se parsea bien: confiar en
 * que nunca aparecerá una coma dentro de un campo es la clase de suposición que
 * se rompe en la fila 300 de la próxima carga.
 */
function partir(linea) {
  const campos = [];
  let actual = '';
  let enComillas = false;

  for (let i = 0; i < linea.length; i += 1) {
    const c = linea[i];
    if (c === '"') {
      if (enComillas && linea[i + 1] === '"') {
        actual += '"';
        i += 1;
      } else enComillas = !enComillas;
    } else if (c === ',' && !enComillas) {
      campos.push(actual);
      actual = '';
    } else {
      actual += c;
    }
  }
  campos.push(actual);
  return campos.map((c) => c.trim());
}

const prisma = new PrismaClient();

try {
  const usuario = await prisma.user.findFirst({
    where: correo ? { email: correo.toLowerCase() } : {},
    orderBy: { id: 'asc' },
  });
  if (!usuario) throw new Error(`No encontré al usuario ${correo ?? '(el primero)'}.`);
  console.log(`▸ Cargando para ${usuario.email}`);

  const lineas = readFileSync(archivo, 'utf8')
    .split('\n')
    .filter((l) => l.trim());
  const cabecera = partir(lineas[0]);
  const col = (nombre) => cabecera.indexOf(nombre);

  const iCentro = col('Centro_de_costos');
  const iGrupo = col('Grupo');
  const iConcepto = col('Concepto');
  const iFecha = col('Fecha_Pago');
  const iValor = col('Valor_COP');
  const iAnio = col('Anio');
  const iMes = col('Mes');

  if ([iCentro, iGrupo, iConcepto, iFecha, iValor].some((i) => i < 0)) {
    throw new Error(
      'Al CSV le falta alguna columna. Se esperan: ' +
        'Centro_de_costos, Grupo, Concepto, Fecha_Pago, Valor_COP.',
    );
  }

  const filas = lineas.slice(1).map(partir);

  // ── El árbol ───────────────────────────────────────────────────────────────
  // Se crea de arriba abajo porque cada nivel necesita el id de su padre.
  // La clave es la RUTA completa ("Costos fijos|Servicios públicos|Celsia"),
  // no el par padre+nombre. Dos grupos distintos pueden tener un concepto que
  // se llame igual, y con el id del padre en la clave el código para leerlo se
  // volvía una madeja de búsquedas anidadas.
  const cache = new Map();

  async function categoria(ruta, nombre, padreId, orden) {
    if (cache.has(ruta)) return cache.get(ruta);

    let fila = await prisma.category.findFirst({
      where: { userId: usuario.id, name: nombre, parentId: padreId },
    });

    if (!fila && !ensayo) {
      fila = await prisma.category.create({
        data: {
          userId: usuario.id,
          name: nombre,
          parentId: padreId,
          kind: 'expense',
          sortOrder: orden,
        },
      });
      console.log(`  + ${padreId === null ? 'centro' : 'nivel'}: ${nombre}`);
    }

    cache.set(ruta, fila);
    return fila;
  }

  const ordenados = [
    ...new Set(filas.map((f) => `${f[iCentro]}|${f[iGrupo]}|${f[iConcepto]}`)),
  ].sort();

  console.log('▸ Árbol…');
  for (const [i, ruta] of ordenados.entries()) {
    const [centro, grupo, concepto] = ruta.split('|');
    const c = await categoria(centro, centro, null, 0);
    const g = await categoria(`${centro}|${grupo}`, grupo, c?.id ?? null, i);
    await categoria(ruta, concepto, g?.id ?? null, i);
  }

  // ── Los movimientos ────────────────────────────────────────────────────────
  console.log('▸ Movimientos…');
  let creados = 0;
  let repetidos = 0;

  for (const f of filas) {
    const concepto = cache.get(`${f[iCentro]}|${f[iGrupo]}|${f[iConcepto]}`);

    const fecha = new Date(`${f[iFecha]}T00:00:00.000Z`);
    const valor = Number.parseInt(f[iValor], 10);
    if (Number.isNaN(valor) || Number.isNaN(fecha.getTime())) {
      console.warn(`  ! fila ilegible, se salta: ${f.join(',')}`);
      continue;
    }

    // El PERÍODO al que pertenece el gasto, que puede no ser el mes del pago.
    const periodo =
      iAnio >= 0 && iMes >= 0 && MESES[f[iMes]?.toLowerCase()]
        ? `${f[iAnio]}-${String(MESES[f[iMes].toLowerCase()]).padStart(2, '0')}`
        : null;

    // La huella lleva la ruta completa Y EL PERÍODO.
    //
    // El período no es decorativo: la PILA de mayo y la de junio pueden pagarse
    // el mismo día por el mismo valor, y son DOS pagos. Sin el período en la
    // huella se colapsaban en uno y el año perdía plata en silencio —que es
    // exactamente lo que pasó en la primera carga de este archivo.
    const huella = createHash('sha256')
      .update([f[iFecha], valor, f[iCentro], f[iGrupo], f[iConcepto], periodo ?? ''].join('|'))
      .digest('hex')
      .slice(0, 40);

    if (
      await prisma.transaction.findFirst({ where: { userId: usuario.id, externalRef: huella } })
    ) {
      repetidos += 1;
      continue;
    }

    if (!ensayo) {
      await prisma.transaction.create({
        data: {
          userId: usuario.id,
          date: fecha,
          // El PERÍODO va en su propia columna, no solo en las notas: es el mes
          // del que uno habla, y la app agrupa por él. La factura de marzo
          // pagada el 6 de abril pertenece a marzo.
          period: periodo
            ? new Date(`${periodo}-01T00:00:00.000Z`)
            : new Date(Date.UTC(fecha.getUTCFullYear(), fecha.getUTCMonth(), 1)),
          amount: valor.toFixed(2),
          type: 'expense',
          categoryId: concepto?.id ?? null,
          description: f[iConcepto],
          // El comercio se guarda igual que la descripción a propósito: es lo
          // que alimenta la categorización automática de futuras importaciones.
          merchant: f[iConcepto],
          notes: periodo ? `Periodo: ${periodo}` : null,
          externalRef: huella,
          status: 'cleared',
        },
      });
    }
    creados += 1;
  }

  console.log(`\n${ensayo ? '(ENSAYO) ' : ''}Listo: ${creados} creados, ${repetidos} ya estaban.`);
} finally {
  await prisma.$disconnect();
}
