import { Injectable, Logger } from '@nestjs/common';

import { CERO, toMoney, type Money } from '../../common/money/money';
import { PrismaService } from '../../prisma/prisma.service';
import {
  esperadoDelMes,
  huellaDelCobro,
  tocaCobrarAutomatico,
  tocaEnElMes,
  vencimiento,
} from './pendientes';

/**
 * Los conceptos que se cobran solos.
 *
 * ── Qué hace ────────────────────────────────────────────────────────────────
 * Un concepto recurrente con pago automático no espera a que nadie lo
 * registre: cuando llega su día de pago, el movimiento se crea aquí y con eso
 * deja de aparecer en pagos pendientes. Es para lo que se cobra sin que uno
 * haga nada —un débito, una suscripción, una cuota domiciliada—, donde ir a
 * marcarlo cada mes es trabajo de escribano para un dinero que ya salió.
 *
 * ── When it runs ────────────────────────────────────────────────────────────
 * From AutoChargeTask (`auto-charge.task.ts`): once a day at 00:05 Bogotá and
 * at every start-up. Until phase 6.7 it ran at the top of GET /dashboard,
 * which made a read write movements and charged nothing for whoever did not
 * open the app that month.
 *
 * ── Y por qué solo el mes EN CURSO ──────────────────────────────────────────
 * Nunca rellena meses pasados. Un mes viejo sin movimiento es un dato —no se
 * pagó, o no se registró— y fabricarlo hacia atrás cambiaría cifras que
 * alguien ya dio por buenas: un promedio, un total de año, una decisión.
 *
 * De ahí sale, sin necesidad de guardar ninguna fecha, que encender el
 * interruptor valga «desde este mes en adelante».
 */
@Injectable()
export class PagosAutomaticosService {
  private readonly logger = new Logger(PagosAutomaticosService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Cobra lo que toque y devuelve cuántos movimientos creó.
   *
   * `mesEnCurso` llega como `YYYY-MM-01` y `hoy` como `YYYY-MM-DD`, los dos ya
   * en la zona horaria del usuario: quién decide qué día es hoy no es asunto
   * de esto.
   */
  async cobrarLoQueToque(userId: bigint, mesEnCurso: string, hoy: string): Promise<number> {
    const conceptos = await this.prisma.category.findMany({
      where: { userId, recurrente: true, pagoAutomatico: true, isArchived: false },
      select: {
        id: true,
        name: true,
        periodicidad: true,
        diaDePago: true,
        mesDePago: true,
        presupuesto: true,
      },
    });

    // Quien no use la función no paga ni una consulta más. Es el caso de casi
    // todo el mundo casi siempre, y este método corre en CADA resumen.
    if (conceptos.length === 0) return 0;

    const delMes = conceptos.filter(
      (c) => c.periodicidad !== null && tocaEnElMes(c.periodicidad, c.mesDePago, mesEnCurso),
    );
    if (delMes.length === 0) return 0;

    const ids = delMes.map((c) => c.id);

    /*
      Lo ya registrado este mes, en CUALQUIER estado.

      Aquí no se filtra por `cleared`, y es a propósito —la lista de pendientes
      sí lo hace—. Allá la pregunta es «¿esto está resuelto?», y un movimiento
      sin confirmar no resuelve nada. Aquí es «¿ya hay algo escrito?», y sí lo
      hay: cobrar encima dejaría el mismo gasto dos veces, uno de ellos
      inventado por nosotros.
    */
    const yaHay = await this.prisma.transaction.findMany({
      where: { userId, categoryId: { in: ids }, period: new Date(mesEnCurso) },
      select: { categoryId: true },
    });
    const registrado = new Set(yaHay.map((t) => t.categoryId?.toString()));

    const porCobrar = delMes.filter((c) => !registrado.has(c.id.toString()));
    if (porCobrar.length === 0) return 0;

    // La historia, solo de los que quedan y solo de ANTES de este mes: de ahí
    // sale la cifra cuando el concepto no tiene presupuesto puesto.
    const historia = await this.prisma.transaction.findMany({
      where: {
        userId,
        categoryId: { in: porCobrar.map((c) => c.id) },
        period: { lt: new Date(mesEnCurso) },
      },
      select: { categoryId: true, amount: true, period: true },
    });

    const historiaDe = new Map<string, Map<string, Money>>();
    for (const t of historia) {
      const clave = t.categoryId?.toString();
      if (clave === undefined) continue;
      const mes = t.period.toISOString().slice(0, 7);
      const meses = historiaDe.get(clave) ?? new Map<string, Money>();
      meses.set(mes, (meses.get(mes) ?? CERO).plus(toMoney(t.amount)));
      historiaDe.set(clave, meses);
    }

    let creados = 0;

    for (const concepto of porCobrar) {
      const vence = vencimiento(mesEnCurso, concepto.diaDePago);
      const esperado = esperadoDelMes(
        concepto.presupuesto === null ? null : toMoney(concepto.presupuesto),
        historiaDe.get(concepto.id.toString()) ?? new Map(),
        mesEnCurso.slice(0, 7),
      );

      if (
        !tocaCobrarAutomatico({
          pagoAutomatico: true,
          vencimientoISO: vence,
          hoyISO: hoy,
          esperado,
        })
      )
        continue;

      try {
        await this.prisma.transaction.create({
          data: {
            userId,
            categoryId: concepto.id,
            date: new Date(vence),
            period: new Date(mesEnCurso),
            amount: esperado!.toFixed(2),
            type: 'expense',
            status: 'cleared',
            // El nombre del concepto, como cualquier movimiento suyo: el de la
            // ficha sale de la clasificación, no de esto, pero la tabla y las
            // búsquedas leen `description`.
            description: concepto.name,
            /*
              Se dice que lo puso la aplicación, y con qué cifra.

              El valor puede ser un ESTIMADO —el promedio de los meses
              anteriores, cuando el concepto no tiene presupuesto— y eso no
              puede quedar indistinguible de una cifra que alguien leyó en un
              recibo. Quien abra el movimiento tiene que poder corregirlo
              sabiendo que hace falta.
            */
            notes:
              concepto.presupuesto === null
                ? 'Cobrado automáticamente. El valor es un estimado del promedio de los meses anteriores: corrígelo cuando tengas el recibo.'
                : 'Cobrado automáticamente, por el presupuesto del concepto.',
            externalRef: huellaDelCobro(concepto.id, mesEnCurso),
          },
        });
        creados += 1;
      } catch (error) {
        /*
          El choque contra la huella única no es un fallo: es dos peticiones
          simultáneas queriendo cobrar lo mismo, y la base impidiendo que se
          duplique. Gana la primera y la segunda sigue su camino.

          Cualquier otro error se registra y tampoco tumba el resumen: quedarse
          sin dashboard porque un cobro automático falló sería cambiar una
          comodidad por una pantalla en blanco.
        */
        const codigo = (error as { code?: string }).code;
        if (codigo !== 'P2002') {
          this.logger.error(
            `No se pudo cobrar “${concepto.name}” (${concepto.id}): ${(error as Error).message}`,
          );
        }
      }
    }

    return creados;
  }
}
