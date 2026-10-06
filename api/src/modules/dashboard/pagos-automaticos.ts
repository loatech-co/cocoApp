import { Injectable, Logger } from '@nestjs/common';

import {
  esperadoDelMes,
  huellaDelCobro,
  tocaCobrarAutomatico,
  tocaEnElMes,
  vencimiento,
  ventanaDeLaHistoria,
} from './pendientes';
import { toMoney } from '../../common/money/money';
import { CategoryLookupService, type AutoPaidConcept } from '../categories/category-lookup.service';
import { LedgerService, type MonthlyHistory } from '../transactions/ledger.service';

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

  constructor(
    private readonly categories: CategoryLookupService,
    private readonly ledger: LedgerService,
  ) {}

  /**
   * Cobra lo que toque y devuelve cuántos movimientos creó.
   *
   * `mesEnCurso` llega como `YYYY-MM-01` y `hoy` como `YYYY-MM-DD`, los dos ya
   * en la zona horaria del usuario: quién decide qué día es hoy no es asunto
   * de esto.
   */
  async cobrarLoQueToque(userId: bigint, mesEnCurso: string, hoy: string): Promise<number> {
    const conceptos = await this.categories.findAutoPaid(userId);

    // Quien no use la función no paga ni una consulta más. Es el caso de casi
    // todo el mundo casi siempre, y este método corre en CADA resumen.
    if (conceptos.length === 0) return 0;

    const delMes = conceptos.filter(
      (c) => c.periodicity !== null && tocaEnElMes(c.periodicity, c.paymentMonth, mesEnCurso),
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
    const registrado = await this.ledger.categoriesWithMovementIn(
      userId,
      ids,
      new Date(mesEnCurso),
    );

    const porCobrar = delMes.filter((c) => !registrado.has(c.id.toString()));
    if (porCobrar.length === 0) return 0;

    // La historia, solo de los que quedan y solo de ANTES de este mes: de ahí
    // sale la cifra cuando el concepto no tiene presupuesto puesto.
    const historiaDe = await this.ledger.monthlyHistory(
      userId,
      porCobrar.map((c) => c.id),
      ventanaDeLaHistoria(mesEnCurso),
    );

    let creados = 0;

    for (const concepto of porCobrar) {
      if (await this.cobrar(userId, concepto, historiaDe, mesEnCurso, hoy)) creados += 1;
    }

    return creados;
  }

  /** Charges one concept if its day came. `true` when it wrote the movement. */
  private async cobrar(
    userId: bigint,
    concepto: AutoPaidConcept,
    historiaDe: MonthlyHistory,
    mesEnCurso: string,
    hoy: string,
  ): Promise<boolean> {
    const vence = vencimiento(mesEnCurso, concepto.paymentDay);
    const esperado = esperadoDelMes(
      concepto.budget === null ? null : toMoney(concepto.budget),
      historiaDe.get(concepto.id.toString()) ?? new Map(),
      mesEnCurso.slice(0, 7),
    );

    if (
      // `tocaCobrarAutomatico` ya responde que no sin monto esperado; se
      // comprueba aquí también para que `esperado` llegue sin nulo.
      esperado === null ||
      !tocaCobrarAutomatico({
        pagoAutomatico: true,
        vencimientoISO: vence,
        hoyISO: hoy,
        esperado,
      })
    )
      return false;

    try {
      return await this.ledger.createAutoCharge({
        userId,
        categoryId: concepto.id,
        date: new Date(vence),
        period: new Date(mesEnCurso),
        amount: esperado.toFixed(2),
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
          concepto.budget === null
            ? 'Cobrado automáticamente. El valor es un estimado del promedio de los meses anteriores: corrígelo cuando tengas el recibo.'
            : 'Cobrado automáticamente, por el presupuesto del concepto.',
        externalRef: huellaDelCobro(concepto.id, mesEnCurso),
      });
    } catch (error) {
      /*
        El choque contra la huella única no llega aquí: es dos peticiones
        simultáneas queriendo cobrar lo mismo, y la base impidiendo que se
        duplique. `createAutoCharge` lo devuelve como `false`: gana la primera
        y la segunda sigue su camino.

        Cualquier otro error se registra y tampoco tumba el resumen: quedarse
        sin dashboard porque un cobro automático falló sería cambiar una
        comodidad por una pantalla en blanco.
      */
      this.logger.error(
        `No se pudo cobrar “${concepto.name}” (${concepto.id}): ${(error as Error).message}`,
      );
      return false;
    }
  }
}
