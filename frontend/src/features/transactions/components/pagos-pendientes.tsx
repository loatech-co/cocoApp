import { Filter } from 'lucide-react';
import { useState, type Dispatch, type SetStateAction } from 'react';

import { type PendingPayment } from '@/shared/api/generated/model';
import { shortDay, formatCOP } from '@/shared/lib/format';
import { t } from '@/shared/lib/i18n';
import { cn } from '@/shared/lib/utils';
import { Card, CardContent } from '@/shared/ui/atoms/card';
import { CardRow } from '@/shared/ui/atoms/card-row';
import { Checkbox } from '@/shared/ui/atoms/checkbox';
import { Progress } from '@/shared/ui/atoms/progress';
import { HIGHLIGHT } from '@/shared/ui/foundations/surface';
import { Menu, MenuTitle } from '@/shared/ui/molecules/menu';

/** Hoy en America/Bogota, para saber qué ya venció. */
function today(): string {
  return new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

/**
 * Lo que falta pagar este mes.
 *
 * ── Por qué son los conceptos y no movimientos ──────────────────────────────
 * Porque un pago pendiente es, por definición, un movimiento que NO EXISTE. Se
 * deduce de los conceptos marcados como recurrentes: si toca este mes y no hay
 * ningún movimiento suyo en el periodo, falta.
 *
 * ── Por qué del mes en curso y no del rango de arriba ───────────────────────
 * Porque "¿qué me falta pagar?" es siempre una pregunta sobre hoy. Revisar
 * 2024 no cambia lo que hay que pagar esta semana.
 */
export function PendingPayments({
  payments,
  onSelect,
  className,
}: {
  payments: PendingPayment[];
  /**
   * Confirmar el pago: abre la ficha de un movimiento nuevo con el concepto,
   * el valor esperado y la fecha de vencimiento ya puestos. Se le pasa el pago
   * ENTERO y no su concepto: los otros dos datos están aquí, y pedirlos otra
   * vez sería teclear mirando esta misma fila.
   */
  onSelect?: (payment: PendingPayment) => void;
  className?: string;
}) {
  const now = today();

  /*
    ── Se puede mirar un centro de costos a la vez ───────────────────────────
    Una suscripción se cobra sola y cuesta lo mismo todos los meses: no hay
    nada que decidir con ella, y diez de esas empujan fuera de la vista lo que
    sí hay que mirar —el recibo de la luz que llegó con recargo, el seguro que
    vence el martes—.

    Se apagan por CENTRO y con casillas, no con un interruptor de dos estados:
    los centros son los que hay, no siempre dos, y una casilla por cada uno
    dice cuáles existen además de dejar elegir. Es el mismo filtro que la barra
    de arriba, en pequeño.

    No se recuerda entre visitas, a propósito: es una forma de mirar esta lista
    ahora, no una preferencia, y un filtro guardado que esconde plata es de los
    que se olvidan puestos.
  */
  const [hidden, setHidden] = useState<ReadonlySet<string>>(() => new Set());

  const { costCenters, visible, total } = pendingView(payments, hidden);

  /*
    Sin pendientes no hay tarjeta.

    Vacía no dice "todo al día": dice "aquí hay una sección", y ocupa un tercio
    de la fila para decirlo. En un periodo cerrado no puede quedar nada
    —ya pasó— y en el mes en curso, con todo pagado, la buena noticia es que
    la tarjeta no esté.

    Se decide también aquí y no solo en el resumen: la rejilla de allá necesita
    saberlo para repartir las columnas, pero un componente que se pinta vacío
    cuando lo llaman sin datos es una trampa esperando a la segunda pantalla
    que lo use.
  */
  if (payments.length === 0) return null;

  return (
    <Card className={cn('h-full', className)}>
      <CardContent className="flex h-full flex-col p-4 sm:p-6">
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-display text-lg font-semibold">{t('transactions.pending.title')}</h2>

          {/*
            Solo con más de un centro: una casilla única no separa nada, y un
            control que no cambia nada se pulsa una vez y se deja de creer en
            él.

            El mismo desplegable que el filtro de la barra de arriba —`Menu`
            con casillas dentro— porque hace lo mismo: recortar lo que se está
            viendo. Se enciende cuando hay algo apagado, que es la señal que ya
            usan los demás filtros de la app.
          */}
          {costCenters.length > 1 && (
            <CenterFilter costCenters={costCenters} hidden={hidden} setHidden={setHidden} />
          )}
        </div>

        {/* El mismo rótulo siempre; lo único que cambia es la cifra, que es la
            de lo que se ve. Añadirle un «solo fijos» al filtrar movía el texto
            debajo del título cada vez que se pulsaba el botón. */}
        <p className="truncate text-xs text-muted-foreground">
          {total > 0
            ? t('transactions.pending.aboutThisMonth', { amount: formatCOP(total) })
            : t('transactions.pending.thisMonth')}
        </p>

        {/* Se desplaza en vez de crecer: la tarjeta comparte fila con la
             gráfica y la dona, y una lista larga estiraría a las tres.

             El par `-mr-3 pr-3` es para la barra de desplazamiento. En macOS
             la barra FLOTA encima del contenido en vez de ocupar sitio, así
             que no basta con que la lista quepa: hay que dejarle aire propio.
             La lista se sale 12px sobre el relleno de la tarjeta —ahí va la
             barra, encima del relleno y fuera de las filas— y su contenido
             termina justo en el borde interior de la tarjeta. */}
        <ul className="-mr-3 mt-4 flex min-h-0 flex-1 flex-col divide-y divide-border overflow-y-auto pr-3">
          {visible.map((payment) => (
            <PendingRow key={payment.categoryId} payment={payment} now={now} onSelect={onSelect} />
          ))}
          {/* Apagados TODOS, la lista queda vacía y la tarjeta se quedaría sin
              nada que enseñar salvo el botón para volver. Se dice, porque un
              hueco en blanco se lee como «no hay nada pendiente», que es lo
              contrario de lo que pasa. */}
          {visible.length === 0 && (
            <li className="py-6 text-center text-sm text-muted-foreground">
              {t('transactions.pending.offCentersNote')}
            </li>
          )}
        </ul>
      </CardContent>
    </Card>
  );
}

/** Lo que lleva cubierto un pago que se hace en varias veces. */
function PendingProgress({
  payment,
  progress,
  hasAction,
}: {
  payment: PendingPayment;
  progress: number | null;
  hasAction: boolean;
}) {
  if (progress === null) return null;
  return (
    <span className="block w-full">
      <Progress
        value={progress}
        label={t('transactions.pending.progressLabel', {
          name: payment.name,
          paid: formatCOP(payment.paidAmount),
          expected: formatCOP(payment.expectedAmount ?? '0'),
        })}
        className="h-1"
      />
      <span className="mt-1.5 flex items-baseline justify-between gap-2 text-xs">
        <span className="tabular min-w-0 truncate text-muted-foreground">
          {t('transactions.pending.soFar', { amount: formatCOP(payment.paidAmount) })}
        </span>
        {hasAction && (
          <span className="shrink-0 font-medium text-acento-tinta">
            {t('transactions.sheet.registerAnother')}
          </span>
        )}
      </span>
    </span>
  );
}

function PendingSummary({ payment, isOverdue }: { payment: PendingPayment; isOverdue: boolean }) {
  return (
    <span className="flex w-full items-center justify-between gap-3">
      <span className="min-w-0">
        <span className="block truncate text-sm font-medium">{payment.name}</span>
        <span className="block truncate text-xs text-muted-foreground">{payment.path}</span>
      </span>

      <span className="shrink-0 text-right">
        {payment.expectedAmount && (
          <span className="tabular block text-sm font-semibold">
            {formatCOP(payment.expectedAmount)}
          </span>
        )}
        {/* Vencido en ámbar, no en rojo: se debe, no salió mal.
              El rojo está reservado a los errores. */}
        <span
          className={cn(
            'block text-xs',
            isOverdue ? 'font-medium text-warning' : 'text-muted-foreground',
          )}
        >
          {shortDay(payment.dueDate)}
        </span>
      </span>
    </span>
  );
}

function PendingRow({
  payment,
  now,
  onSelect,
}: {
  payment: PendingPayment;
  now: string;
  onSelect: ((payment: PendingPayment) => void) | undefined;
}) {
  const isOverdue = payment.dueDate < now;

  /*
      Cuánto lleva cubierto, para los que se pagan en varias veces.

      Es `null` cuando no hay un total al que llegar: sin esperado no
      hay fracción que pintar, y una barra sin denominador es una
      barra que miente. Esos se pintan como cualquier otro pendiente.
    */
  const total = Number(payment.expectedAmount ?? 0);
  const paidSoFar = Number(payment.paidAmount);
  const progress = payment.isMultiPayment && total > 0 ? paidSoFar / total : null;

  return (
    <li
      /*
          Los dos divisores que TOCA la fila señalada se apagan.

          El resaltado es un rectángulo redondeado, y una línea que
          le entra por el canto lo parte: se lee como si la fila
          estuviera cortada en vez de levantada. Apagando la raya de
          arriba y la de abajo, la fila queda suelta entre las otras
          —que es lo que está diciendo— y la lista no pierde su
          retícula, porque las demás siguen ahí.

          En Tailwind 4 el divisor es el borde de ABAJO del elemento
          anterior, así que hay dos que apagar y no uno: el propio,
          que es el de abajo, y el del que va justo antes, que es el
          de arriba. De ahí el `:has()`.

          Y se desvanecen en vez de desaparecer: la fila ya cambia
          de color con una transición, y una raya que salta mientras
          el fondo se funde se ve como un fallo de pintado.
        */
      className={cn(
        'transition-colors',
        'hover:border-b-transparent',
        '[&:has(+li:hover)]:border-b-transparent',
      )}
    >
      <CardRow onClick={onSelect ? () => onSelect(payment) : undefined}>
        <PendingSummary payment={payment} isOverdue={isOverdue} />

        {/*
            ── Lo que lleva cubierto ──────────────────────────────
            La cifra de la derecha es el TOTAL del mes, igual que en
            cualquier otro pendiente. Lo que esta línea añade es
            dónde va: sin ella, un concepto que se paga en varias
            veces se lee como uno que no se ha pagado nada, que es
            justo lo contrario de lo que pasa.

            Y dice «Registrar otro» y no «Confirmar pago» porque eso
            es lo que va a ocurrir al pulsar: la ficha se abre con el
            valor VACÍO y la fecha de hoy, para anotar esta ida y no
            para dar el mes por saldado.
          */}
        <PendingProgress payment={payment} progress={progress} hasAction={onSelect !== undefined} />
      </CardRow>
    </li>
  );
}

function CenterFilter({
  costCenters,
  hidden,
  setHidden,
}: {
  costCenters: [id: string, nombre: string][];
  hidden: ReadonlySet<string>;
  setHidden: Dispatch<SetStateAction<ReadonlySet<string>>>;
}) {
  return (
    <Menu
      label={t('transactions.pending.filterByCostCenter')}
      Icon={Filter}
      isIconOnly
      isActive={hidden.size > 0}
      kind="panel"
      width="sm"
      align="right"
    >
      <div className="flex flex-col">
        <MenuTitle>{t('shell.sections.costCenters')}</MenuTitle>
        {costCenters.map(([id, name]) => {
          const isChecked = !hidden.has(id);
          return (
            <label
              key={id}
              className={cn(
                'flex cursor-pointer items-center gap-2.5 rounded-md px-2.5 py-2 text-sm',
                HIGHLIGHT,
                isChecked && 'font-medium',
              )}
            >
              <Checkbox
                checked={isChecked}
                onChange={() => setHidden((before) => toggleCenter(before, id, isChecked))}
              />
              <span className="min-w-0 flex-1 truncate">{name}</span>
            </label>
          );
        })}
      </div>
    </Menu>
  );
}

/** Los centros ocultos después de pulsar la casilla de uno. */
function toggleCenter(
  before: ReadonlySet<string>,
  id: string,
  isChecked: boolean,
): ReadonlySet<string> {
  const next = new Set(before);
  // Desmarcar el último dejaría la tarjeta vacía sin
  // decir por qué. Se permite —y la lista lo explica—
  // porque negarlo obligaría a adivinar cuál de las
  // casillas está trabada y por qué.
  if (isChecked) next.add(id);
  else next.delete(id);
  return next;
}

/** Lo que se ve: los centros que se pueden apagar, los pagos encendidos y su suma. */
function pendingView(payments: PendingPayment[], hidden: ReadonlySet<string>) {
  /*
    ── Si el dato no viene, el filtro no existe ──────────────────────────────
    El centro lo manda el servidor, y un servidor más viejo que esta pantalla
    no lo manda. Filtrar sin él dejaría la lista vacía y el botón parecería
    roto, que es justo lo que pasó: es la asimetría normal de un despliegue,
    donde la pantalla y la API no llegan a la vez.
  */
  const isMissingData = payments.some(
    (p) => (p as Partial<PendingPayment>).costCenterId === undefined,
  );

  // Los centros que de verdad tienen algo pendiente, en el orden en que
  // aparecen: una casilla para un centro sin nada que mostrar no filtra nada.
  const costCenters = isMissingData
    ? []
    : [...new Map(payments.map((p) => [String(p.costCenterId), p.costCenter])).entries()];

  const visible = payments.filter((p) => isMissingData || !hidden.has(String(p.costCenterId)));

  // El total es el de lo que SE VE. Con la suma de todo bajo una lista
  // recortada, la cifra contradice lo que hay debajo y no hay forma de saber
  // cuál de las dos miente.
  const total = visible.reduce((s, p) => s + Number(p.expectedAmount ?? 0), 0);

  return { costCenters, visible, total };
}
