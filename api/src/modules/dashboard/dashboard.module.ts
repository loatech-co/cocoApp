import { Controller, Get, Injectable, Module, Query } from '@nestjs/common';
import { IsOptional, Matches } from 'class-validator';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { CERO, serializar, toMoney } from '../../common/money/money';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';
import { PrismaService } from '../../prisma/prisma.service';
import { AccountsModule } from '../accounts/accounts.module';
import { AccountsService, type AccountView } from '../accounts/accounts.service';
import {
  calcularFlujo,
  calcularGastoPorCategoria,
  type MovimientoAgregable,
} from './dashboard.aggregate';

export class DashboardQueryDto {
  /** Mes en formato YYYY-MM. Por defecto, el mes en curso. */
  @IsOptional()
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/, { message: 'El mes debe tener formato YYYY-MM.' })
  month?: string;
}

interface GastoPorCategoriaPayload {
  category_id: bigint | null;
  name: string;
  color: string | null;
  icon: string | null;
  total: string;
  count: number;
}

export interface DashboardPayload {
  period: { month: string; start: string; end: string };
  accounts: AccountView[];
  totals: {
    /** Suma de las cuentas de activo. */
    assets: string;
    /** Suma de lo adeudado en tarjetas. */
    debts: string;
    /** Activos − deudas. */
    net_worth: string;
  };
  month: { income: string; expense: string; net: string };
  by_category: GastoPorCategoriaPayload[];
}

/**
 * Rango del mes en `America/Bogota` (UTC−5, sin horario de verano).
 *
 * Importa hacerlo explícito: si los límites se calcularan en UTC, un gasto del
 * 31 a las 8 p.m. hora de Bogotá caería en el mes siguiente y el usuario vería
 * su plata en el mes equivocado.
 */
function rangoDelMes(month?: string): { month: string; inicio: Date; fin: Date } {
  const ahoraEnBogota = new Date(Date.now() - 5 * 60 * 60 * 1000);
  const mes =
    month ??
    `${ahoraEnBogota.getUTCFullYear()}-${String(ahoraEnBogota.getUTCMonth() + 1).padStart(2, '0')}`;

  const [anio, numeroDeMes] = mes.split('-').map(Number) as [number, number];

  return {
    month: mes,
    inicio: new Date(Date.UTC(anio, numeroDeMes - 1, 1)),
    fin: new Date(Date.UTC(anio, numeroDeMes, 0)),
  };
}

const aISO = (fecha: Date): string => fecha.toISOString().slice(0, 10);

@Injectable()
export class DashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly accounts: AccountsService,
  ) {}

  async resumen(userId: bigint, month?: string): Promise<DashboardPayload> {
    const { month: mes, inicio, fin } = rangoDelMes(month);

    const [cuentas, movimientos, categorias] = await Promise.all([
      this.accounts.listar(userId, false),
      this.prisma.transaction.findMany({
        where: { userId, date: { gte: inicio, lte: fin } },
        select: {
          type: true,
          amount: true,
          categoryId: true,
          splits: { select: { categoryId: true, amount: true } },
        },
      }),
      this.prisma.category.findMany({
        where: { userId },
        select: { id: true, name: true, color: true, icon: true },
      }),
    ]);

    const agregables: MovimientoAgregable[] = movimientos.map((movimiento) => ({
      type: movimiento.type,
      amount: toMoney(movimiento.amount),
      categoryId: movimiento.categoryId,
      splits: movimiento.splits.map((split) => ({
        categoryId: split.categoryId,
        amount: toMoney(split.amount),
      })),
    }));

    const flujo = calcularFlujo(agregables);

    const nombresDeCategoria = new Map(
      categorias.map((categoria) => [categoria.id.toString(), categoria]),
    );

    const porCategoria = calcularGastoPorCategoria(agregables).map((fila) => {
      const categoria =
        fila.category_id === null ? undefined : nombresDeCategoria.get(fila.category_id.toString());

      return {
        category_id: fila.category_id,
        name: categoria?.name ?? 'Sin categorizar',
        color: categoria?.color ?? null,
        icon: categoria?.icon ?? null,
        total: serializar(fila.total),
        count: fila.count,
      };
    });

    // Los saldos ya vienen derivados de AccountsService: aquí solo se separan
    // activos de pasivos para el patrimonio neto.
    const activos = cuentas
      .filter((cuenta) => cuenta.type !== 'credit')
      .reduce((total, cuenta) => total.plus(toMoney(cuenta.balance)), CERO);

    const deudas = cuentas
      .filter((cuenta) => cuenta.type === 'credit')
      .reduce((total, cuenta) => total.plus(toMoney(cuenta.balance)), CERO);

    return {
      period: { month: mes, start: aISO(inicio), end: aISO(fin) },
      accounts: cuentas,
      totals: {
        assets: serializar(toMoney(activos)),
        debts: serializar(toMoney(deudas)),
        net_worth: serializar(toMoney(activos.minus(deudas))),
      },
      month: {
        income: serializar(flujo.income),
        expense: serializar(flujo.expense),
        net: serializar(flujo.net),
      },
      by_category: porCategoria,
    };
  }
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
    return this.dashboard.resumen(user.id, query.month);
  }
}

@Module({
  imports: [AccountsModule],
  controllers: [DashboardController],
  providers: [DashboardService],
})
export class DashboardModule {}
