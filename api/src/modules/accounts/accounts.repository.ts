import { Injectable } from '@nestjs/common';

import type { MovimientoDeSaldo } from '../../common/money/balance';
import { toMoney } from '../../common/money/money';
import type { Account, Prisma } from '../../generated/prisma/client';
import { Database } from '../../prisma/database';

@Injectable()
export class AccountsRepository {
  constructor(private readonly db: Database) {}

  /**
   * Toda consulta filtra por `userId`. No es una convención de estilo: sin ese
   * filtro, cambiar un id en la URL leería datos de otro usuario (IDOR).
   */
  async listar(userId: bigint, incluirArchivadas: boolean): Promise<Account[]> {
    return this.db.forUser(userId, (tx) =>
      tx.account.findMany({
        where: { userId, ...(incluirArchivadas ? {} : { isArchived: false }) },
        orderBy: [{ isArchived: 'asc' }, { name: 'asc' }],
      }),
    );
  }

  async buscarPorId(userId: bigint, id: bigint): Promise<Account | null> {
    return this.db.forUser(userId, (tx) => tx.account.findFirst({ where: { id, userId } }));
  }

  async crear(userId: bigint, data: Prisma.AccountUncheckedCreateInput): Promise<Account> {
    // El userId se fija desde el token, nunca desde el payload.
    return this.db.forUser(userId, (tx) => tx.account.create({ data: { ...data, userId } }));
  }

  /**
   * `updateMany` con userId en el where, no `update` por id a secas: si la fila
   * es de otro usuario el count queda en 0 y podemos responder 404 sin haberla
   * tocado ni confirmado que existe.
   */
  async actualizar(userId: bigint, id: bigint, data: Prisma.AccountUpdateInput): Promise<number> {
    const { count } = await this.db.forUser(userId, (tx) =>
      tx.account.updateMany({ where: { id, userId }, data }),
    );
    return count;
  }

  async borrar(userId: bigint, id: bigint): Promise<number> {
    const { count } = await this.db.forUser(userId, (tx) =>
      tx.account.deleteMany({ where: { id, userId } }),
    );
    return count;
  }

  async contarMovimientos(userId: bigint, accountId: bigint): Promise<number> {
    return this.db.forUser(userId, (tx) => tx.transaction.count({ where: { userId, accountId } }));
  }

  /**
   * Agrega los movimientos de TODAS las cuentas del usuario en una sola
   * consulta, agrupados por (cuenta, tipo, dirección, estado).
   *
   * Se agrupa en vez de traer las filas una por una porque el efecto de un
   * movimiento sobre el saldo es lineal en el monto: sumar primero y aplicar el
   * signo después da exactamente el mismo resultado que recorrer cada fila, y
   * evita traerse años de historial a memoria solo para listar cuentas.
   */
  async agregadosDeSaldo(userId: bigint, hasta?: Date): Promise<Map<string, MovimientoDeSaldo[]>> {
    const grupos = await this.db.forUser(userId, (tx) =>
      tx.transaction.groupBy({
        by: ['accountId', 'type', 'transferDir', 'status'],
        where: {
          userId,
          // Un movimiento sin cuenta no participa de ningún saldo, y se descarta
          // aquí en vez de más abajo para no traerse filas que hay que ignorar.
          // Los saldos siguen siendo exactos para las cuentas que existan;
          // sencillamente no hay saldo para lo que no pertenece a ninguna.
          accountId: { not: null },
          ...(hasta ? { date: { lte: hasta } } : {}),
        },
        _sum: { amount: true },
      }),
    );

    const porCuenta = new Map<string, MovimientoDeSaldo[]>();

    for (const grupo of grupos) {
      // El filtro del where ya lo garantiza; TypeScript no puede saberlo.
      if (grupo.accountId === null) continue;
      const clave = grupo.accountId.toString();
      const lista = porCuenta.get(clave) ?? [];

      lista.push({
        type: grupo.type,
        transferDir: grupo.transferDir,
        amount: toMoney(grupo._sum.amount ?? 0),
        status: grupo.status,
      });

      porCuenta.set(clave, lista);
    }

    return porCuenta;
  }
}
