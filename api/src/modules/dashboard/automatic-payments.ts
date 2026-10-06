import { Injectable, Logger } from '@nestjs/common';

import {
  expectedForMonth,
  chargeFingerprint,
  isAutoChargeDue,
  isDueInMonth,
  dueDate,
  historyWindow,
} from './pending';
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
export class AutomaticPaymentsService {
  private readonly logger = new Logger(AutomaticPaymentsService.name);

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
  async chargeDue(userId: bigint, currentMonth: string, today: string): Promise<number> {
    const concepts = await this.categories.findAutoPaid(userId);

    // Quien no use la función no paga ni una consulta más. Es el caso de casi
    // todo el mundo casi siempre, y este método corre en CADA resumen.
    if (concepts.length === 0) return 0;

    const dueThisMonth = concepts.filter(
      (c) => c.periodicity !== null && isDueInMonth(c.periodicity, c.paymentMonth, currentMonth),
    );
    if (dueThisMonth.length === 0) return 0;

    const ids = dueThisMonth.map((c) => c.id);

    /*
      Lo ya registrado este mes, en CUALQUIER estado.

      Aquí no se filtra por `cleared`, y es a propósito —la lista de pendientes
      sí lo hace—. Allá la pregunta es «¿esto está resuelto?», y un movimiento
      sin confirmar no resuelve nada. Aquí es «¿ya hay algo escrito?», y sí lo
      hay: cobrar encima dejaría el mismo gasto dos veces, uno de ellos
      inventado por nosotros.
    */
    const recorded = await this.ledger.categoriesWithMovementIn(
      userId,
      ids,
      new Date(currentMonth),
    );

    const toCharge = dueThisMonth.filter((c) => !recorded.has(c.id.toString()));
    if (toCharge.length === 0) return 0;

    // La historia, solo de los que quedan y solo de ANTES de este mes: de ahí
    // sale la cifra cuando el concepto no tiene presupuesto puesto.
    const history = await this.ledger.monthlyHistory(
      userId,
      toCharge.map((c) => c.id),
      historyWindow(currentMonth),
    );

    let created = 0;

    for (const concept of toCharge) {
      if (await this.chargeOne(userId, concept, history, currentMonth, today)) created += 1;
    }

    return created;
  }

  /** Charges one concept if its day came. `true` when it wrote the movement. */
  private async chargeOne(
    userId: bigint,
    concept: AutoPaidConcept,
    history: MonthlyHistory,
    currentMonth: string,
    today: string,
  ): Promise<boolean> {
    const due = dueDate(currentMonth, concept.paymentDay);
    const expected = expectedForMonth(
      concept.budget === null ? null : toMoney(concept.budget),
      history.get(concept.id.toString()) ?? new Map(),
      currentMonth.slice(0, 7),
    );

    if (
      // `tocaCobrarAutomatico` ya responde que no sin monto esperado; se
      // comprueba aquí también para que `esperado` llegue sin nulo.
      expected === null ||
      !isAutoChargeDue({
        isAutoPaid: true,
        dueDateIso: due,
        todayIso: today,
        expected,
      })
    )
      return false;

    try {
      return await this.ledger.createAutoCharge({
        userId,
        categoryId: concept.id,
        date: new Date(due),
        period: new Date(currentMonth),
        amount: expected.toFixed(2),
        // El nombre del concepto, como cualquier movimiento suyo: el de la
        // ficha sale de la clasificación, no de esto, pero la tabla y las
        // búsquedas leen `description`.
        description: concept.name,
        /*
          Se dice que lo puso la aplicación, y con qué cifra.

          El valor puede ser un ESTIMADO —el promedio de los meses
          anteriores, cuando el concepto no tiene presupuesto— y eso no
          puede quedar indistinguible de una cifra que alguien leyó en un
          recibo. Quien abra el movimiento tiene que poder corregirlo
          sabiendo que hace falta.
        */
        notes:
          concept.budget === null
            ? 'Cobrado automáticamente. El valor es un estimado del promedio de los meses anteriores: corrígelo cuando tengas el recibo.'
            : 'Cobrado automáticamente, por el presupuesto del concepto.',
        externalRef: chargeFingerprint(concept.id, currentMonth),
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
        `No se pudo cobrar “${concept.name}” (${concept.id}): ${(error as Error).message}`,
      );
      return false;
    }
  }
}
