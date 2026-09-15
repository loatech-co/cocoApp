import { Controller, Get, Injectable, Module, Query } from '@nestjs/common';
import { Type } from 'class-transformer';
import { IsDateString, IsInt, IsOptional, IsString, MaxLength } from 'class-validator';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { CERO, serializar, toMoney } from '../../common/money/money';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';
import { PrismaService } from '../../prisma/prisma.service';
import { AccountsModule } from '../accounts/accounts.module';
import { AccountsService, type AccountView } from '../accounts/accounts.service';
import { descendientesDe } from '../categories/categories.tree';
import {
  ancestroEnNivel,
  calcularFlujo,
  cuboDe,
  cubosDelRango,
  granularidadPara,
  type CategoriaPlana,
  type MovimientoAgregable,
} from './dashboard.aggregate';

/**
 * Los mismos filtros que la lista de movimientos, a propósito.
 *
 * El resumen y la lista son dos vistas del MISMO recorte: quien filtra por
 * "Servicios públicos" en el resumen y salta a movimientos espera ver esos
 * movimientos, no todos. Dos juegos de filtros distintos garantizarían que las
 * cifras de una pantalla no expliquen las de la otra.
 */
export class DashboardQueryDto {
  /** Inicio del rango, inclusive. Por defecto, el 1 del mes en curso. */
  @IsOptional()
  @IsDateString({}, { message: 'La fecha desde debe tener formato YYYY-MM-DD.' })
  from?: string;

  /** Fin del rango, inclusive. Por defecto, hoy. */
  @IsOptional()
  @IsDateString({}, { message: 'La fecha hasta debe tener formato YYYY-MM-DD.' })
  to?: string;

  /** Centro de costos, grupo o concepto. Incluye toda su rama. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  category_id?: number;

  /** Busca en descripción, comercio y notas. Sin distinguir mayúsculas. */
  @IsOptional()
  @IsString()
  @MaxLength(255)
  q?: string;
}

interface GastoPorCategoriaPayload {
  category_id: bigint | null;
  name: string;
  color: string | null;
  icon: string | null;
  total: string;
  count: number;
}

export interface PuntoDeTendencia {
  /** `2025-03-14` o `2025-03`, según la granularidad. */
  bucket: string;
  expense: string;
  income: string;
  net: string;
}

export interface DashboardPayload {
  period: { from: string; to: string; granularity: 'dia' | 'mes' };
  accounts: AccountView[];
  totals: {
    /** Suma de las cuentas de activo. */
    assets: string;
    /** Suma de lo adeudado en tarjetas. */
    debts: string;
    /** Activos − deudas. */
    net_worth: string;
  };
  /** Del RANGO filtrado, no del mes. */
  range: { income: string; expense: string; net: string; count: number };
  /**
   * Desglose un nivel POR DEBAJO de lo que se está mirando: sin filtro, por
   * centro de costos; dentro de un centro, por sus grupos; dentro de un grupo,
   * por sus conceptos. Es lo que permite ir bajando sin cambiar de pantalla.
   */
  by_category: GastoPorCategoriaPayload[];
  breakdown_level: 'centro de costos' | 'grupo' | 'concepto';
  trend: PuntoDeTendencia[];
}

/**
 * Rango del mes en `America/Bogota` (UTC−5, sin horario de verano).
 *
 * Importa hacerlo explícito: si los límites se calcularan en UTC, un gasto del
 * 31 a las 8 p.m. hora de Bogotá caería en el mes siguiente y el usuario vería
 * su plata en el mes equivocado.
 */
function rangoPorDefecto(from?: string, to?: string): { inicio: Date; fin: Date } {
  const ahoraEnBogota = new Date(Date.now() - 5 * 60 * 60 * 1000);

  // Por defecto: del 1 del mes en curso a hoy. Es el "mes hasta la fecha", que
  // responde la pregunta que uno se hace a diario —"¿cómo voy este mes?"— sin
  // mezclarla con días que todavía no ocurrieron.
  const inicio = from
    ? new Date(`${from}T00:00:00.000Z`)
    : new Date(Date.UTC(ahoraEnBogota.getUTCFullYear(), ahoraEnBogota.getUTCMonth(), 1));

  const fin = to
    ? new Date(`${to}T00:00:00.000Z`)
    : new Date(
        Date.UTC(
          ahoraEnBogota.getUTCFullYear(),
          ahoraEnBogota.getUTCMonth(),
          ahoraEnBogota.getUTCDate(),
        ),
      );

  return { inicio, fin };
}

const aISO = (fecha: Date): string => fecha.toISOString().slice(0, 10);

@Injectable()
export class DashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly accounts: AccountsService,
  ) {}

  async resumen(userId: bigint, query: DashboardQueryDto): Promise<DashboardPayload> {
    const { inicio, fin } = rangoPorDefecto(query.from, query.to);

    const categorias = await this.prisma.category.findMany({
      where: { userId },
      select: { id: true, name: true, color: true, icon: true, parentId: true },
    });

    const planas: CategoriaPlana[] = categorias.map((c) => ({ id: c.id, parentId: c.parentId }));
    const porId = new Map(planas.map((c) => [c.id.toString(), c]));
    const datosDe = new Map(categorias.map((c) => [c.id.toString(), c]));

    // Filtrar por una categoría trae TODA su rama: los movimientos cuelgan del
    // concepto, nunca del centro ni del grupo.
    const rama =
      query.category_id !== undefined
        ? [BigInt(query.category_id), ...descendientesDe(planas, BigInt(query.category_id))]
        : null;

    // El desglose baja un nivel respecto de lo que se mira: sin filtro se
    // agrupa por centro; dentro de un centro, por grupo; dentro de un grupo,
    // por concepto. Dentro de un concepto ya no hay a dónde bajar.
    const nivelFiltrado =
      query.category_id === undefined
        ? 0
        : profundidadDeCategoria(porId, BigInt(query.category_id));
    const nivelDesglose = Math.min(nivelFiltrado + 1, 3);

    const [cuentas, movimientos] = await Promise.all([
      this.accounts.listar(userId, false),
      this.prisma.transaction.findMany({
        where: {
          userId,
          // Por PERÍODO, no por fecha de pago: la factura de marzo pagada el
          // 6 de abril pertenece a marzo, y es en marzo donde uno la busca.
          period: { gte: inicio, lte: fin },
          ...(rama && { categoryId: { in: rama } }),
          ...(query.q && {
            OR: [
              { description: { contains: query.q, mode: 'insensitive' as const } },
              { merchant: { contains: query.q, mode: 'insensitive' as const } },
              { notes: { contains: query.q, mode: 'insensitive' as const } },
            ],
          }),
        },
        select: {
          period: true,
          type: true,
          amount: true,
          categoryId: true,
          splits: { select: { categoryId: true, amount: true } },
        },
      }),
    ]);

    const agregables: MovimientoAgregable[] = movimientos.map((m) => ({
      type: m.type,
      amount: toMoney(m.amount),
      categoryId: m.categoryId,
      splits: m.splits.map((s) => ({ categoryId: s.categoryId, amount: toMoney(s.amount) })),
    }));

    const flujo = calcularFlujo(agregables);

    // ── Desglose, subiendo cada movimiento al nivel que toca ──────────────────
    const acumulado = new Map<string, { id: bigint | null; total: typeof CERO; count: number }>();

    for (const m of movimientos) {
      if (m.type !== 'expense') continue;

      // Con splits, cada parte puede ir a una categoría distinta.
      const partes =
        m.splits.length > 0
          ? m.splits.map((s) => ({ categoryId: s.categoryId, amount: toMoney(s.amount) }))
          : [{ categoryId: m.categoryId, amount: toMoney(m.amount) }];

      for (const parte of partes) {
        const destino = ancestroEnNivel(porId, parte.categoryId, nivelDesglose);
        const clave = destino?.toString() ?? 'sin';
        const actual = acumulado.get(clave) ?? { id: destino, total: CERO, count: 0 };
        acumulado.set(clave, {
          id: destino,
          total: actual.total.plus(parte.amount),
          count: actual.count + 1,
        });
      }
    }

    const porCategoria: GastoPorCategoriaPayload[] = [...acumulado.values()]
      .map((fila) => {
        const datos = fila.id === null ? undefined : datosDe.get(fila.id.toString());
        return {
          category_id: fila.id,
          name: datos?.name ?? 'Sin clasificar',
          color: datos?.color ?? null,
          icon: datos?.icon ?? null,
          total: serializar(toMoney(fila.total)),
          count: fila.count,
        };
      })
      .sort((a, b) => Number(b.total) - Number(a.total));

    // ── Tendencia ─────────────────────────────────────────────────────────────
    const granularidad = granularidadPara(inicio, fin);
    const cubos = new Map(
      cubosDelRango(inicio, fin, granularidad).map((b) => [
        b,
        { expense: CERO, income: CERO },
      ]),
    );

    for (const m of movimientos) {
      // Las transferencias no son gasto ni ingreso: solo cambian de bolsillo.
      if (m.type === 'transfer') continue;
      const cubo = cuboDe(m.period, granularidad);
      const actual = cubos.get(cubo);
      if (!actual) continue;
      const monto = toMoney(m.amount);
      if (m.type === 'expense') actual.expense = actual.expense.plus(monto);
      else actual.income = actual.income.plus(monto);
    }

    const tendencia: PuntoDeTendencia[] = [...cubos.entries()].map(([bucket, v]) => ({
      bucket,
      expense: serializar(toMoney(v.expense)),
      income: serializar(toMoney(v.income)),
      net: serializar(toMoney(v.income.minus(v.expense))),
    }));

    const activos = cuentas
      .filter((c) => c.type !== 'credit')
      .reduce((total, c) => total.plus(toMoney(c.balance)), CERO);
    const deudas = cuentas
      .filter((c) => c.type === 'credit')
      .reduce((total, c) => total.plus(toMoney(c.balance)), CERO);

    return {
      period: { from: aISO(inicio), to: aISO(fin), granularity: granularidad },
      accounts: cuentas,
      totals: {
        assets: serializar(toMoney(activos)),
        debts: serializar(toMoney(deudas)),
        net_worth: serializar(toMoney(activos.minus(deudas))),
      },
      range: {
        income: serializar(flujo.income),
        expense: serializar(flujo.expense),
        net: serializar(flujo.net),
        count: movimientos.length,
      },
      by_category: porCategoria,
      breakdown_level: (['centro de costos', 'grupo', 'concepto'] as const)[nivelDesglose - 1],
      trend: tendencia,
    };
  }
}

/** En qué nivel está una categoría: 1 centro, 2 grupo, 3 concepto. */
function profundidadDeCategoria(
  porId: ReadonlyMap<string, CategoriaPlana>,
  id: bigint,
): number {
  let nivel = 0;
  let actual: bigint | null = id;
  const visitados = new Set<string>();

  while (actual !== null) {
    const clave = actual.toString();
    if (visitados.has(clave)) break;
    visitados.add(clave);
    nivel += 1;
    actual = porId.get(clave)?.parentId ?? null;
  }

  return nivel;
}

/** M5 — Dashboard. Todo derivado; ninguna cifra se almacena. */
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  @Get()
  resumen(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: DashboardQueryDto,
  ): Promise<DashboardPayload> {
    return this.dashboard.resumen(user.id, query);
  }
}

@Module({
  imports: [AccountsModule],
  controllers: [DashboardController],
  providers: [DashboardService],
})
export class DashboardModule {}
