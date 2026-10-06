import { Repeat } from 'lucide-react';
import { useState } from 'react';

import { PERIODICITIES, type Periodicity } from '@/features/cost-centers/model/periodicity';
import { capitalize, LONG_MONTHS } from '@/shared/lib/format';
import { t } from '@/shared/lib/i18n';
import { useOnChange } from '@/shared/lib/on-change';
import { cn } from '@/shared/lib/utils';
import { Field } from '@/shared/ui/atoms/field';
import { Input } from '@/shared/ui/atoms/input';
import { Switch } from '@/shared/ui/atoms/switch';
import { MoneyField } from '@/shared/ui/molecules/money-field';
import { Select } from '@/shared/ui/organisms/select';

const LABELS: Record<Periodicity, string> = {
  monthly: t('centers.recurrence.periodicity.monthly'),
  bimonthly: t('centers.recurrence.periodicity.bimonthly'),
  quarterly: t('centers.recurrence.periodicity.quarterly'),
  semiannual: t('centers.recurrence.periodicity.semiannual'),
  annual: t('centers.recurrence.periodicity.annual'),
};

export interface Recurrence {
  isRecurring: boolean;
  periodicity: Periodicity;
  paymentDay: number;
  /** El mes del ciclo. Solo se usa —y se pregunta— si no es mensual. */
  paymentMonth: number;
  /**
   * Lo que se espera que cueste cada vez. Solo cifras, sin puntos; vacío es
   * «no lo sé, estímalo».
   */
  budget: string;
  /** Si el movimiento se crea solo al llegar el día de pago. */
  isAutoPay: boolean;
  /**
   * Si el concepto se cubre a pedazos: el mercado en cuatro idas, la gasolina
   * en seis tanqueadas. Se queda en pagos pendientes hasta que lo pagado
   * alcanza lo esperado, en vez de salirse al primer movimiento.
   *
   * Incompatible con `pagoAutomatico`: ver el porqué junto al interruptor.
   */
  isMultiPayment: boolean;
}

const MONTHS = LONG_MONTHS.map(capitalize);

/**
 * Marcar un concepto como un pago que vuelve.
 *
 * ── Por qué es del CONCEPTO y no del movimiento ─────────────────────────────
 * Lo que se repite es "el alquiler", no el pago de septiembre. Puesta en cada
 * movimiento habría que repetirla doce veces al año y mantenerlas de acuerdo
 * entre sí; y en un mes sin pagar no habría ningún movimiento donde leerla,
 * que es justo cuando hace falta saber que falta.
 *
 * Por eso el aviso: tocarla aquí cambia el concepto entero, no esta fila.
 */
export function RecurrenceFields({
  value,
  onChange,
  /** El nombre del concepto, para que el aviso diga a qué afecta. */
  concept,
  className,
}: {
  value: Recurrence;
  onChange: (next: Recurrence) => void;
  concept?: string;
  className?: string;
}) {
  return (
    /*
      Un bloque, no un `fieldset` con su `legend`.

      La leyenda se dibuja ENCIMA del borde, partiéndolo, y con el título en
      versalitas el conjunto se leía como una etiqueta pegada a una caja. Aquí
      lo que hay es un interruptor con su explicación, y lo que aparece debajo
      solo existe si está encendido: eso se lee mejor como una fila con un
      control a la derecha.
    */
    /*
      SIN `overflow-hidden`, y con `relative z-10`.

      El recorte estaba ahí para que el fondo de la fila de abajo respetara
      las esquinas, pero también recortaba el desplegable de la periodicidad,
      que se abre por fuera del bloque. Las esquinas las redondea ahora esa
      fila por su cuenta; el `z-10` lo pone por encima de lo que venga
      después, que si no lo tapaba por orden de pintado.
    */
    <div className={cn('relative z-10 rounded-lg border border-border', className)}>
      <label className="flex cursor-pointer items-center gap-3 p-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-full bg-muted text-muted-foreground">
          <Repeat className="size-4" aria-hidden="true" />
        </span>

        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium">{t('centers.recurrence.title')}</span>
          <span className="mt-0.5 block text-xs text-muted-foreground">
            {concept
              ? t('centers.recurrence.scopeConcept', { concept })
              : t('centers.recurrence.scopePending')}
          </span>
        </span>

        <Switch
          checked={value.isRecurring}
          onChange={(e) => onChange({ ...value, isRecurring: e.target.checked })}
        />
      </label>

      {/*
        Los campos solo existen si está encendido, y CUÁLES depende de cada
        cuánto vuelve. "Cada tres meses" con un solo día del mes no dice nada:
        ¿tres meses contados desde cuándo? Por eso, en cuanto deja de ser
        mensual, aparece el mes del ciclo.
      */}
      {value.isRecurring && <RecurrenceDetails value={value} onChange={onChange} />}
    </div>
  );
}

/**
 * El día escrito, encajado entre 1 y 31.
 *
 * Vacío cuenta como 1 en vez de quedar en blanco: un campo numérico sin valor
 * deja el formulario en un estado que no se puede guardar y no lo dice.
 */
/**
 * El día del mes, que se puede BORRAR mientras se escribe.
 *
 * ── El fallo ────────────────────────────────────────────────────────────────
 * El campo pintaba directamente el número del valor y recortaba cada tecla con
 * `entre1y31`. Y `entre1y31('')` devuelve 1 —no hay número, se cae al mínimo—,
 * así que al borrar el contenido el campo se rescribía solo en el mismo
 * fotograma: la tecla de borrar no hacía nada visible y para cambiar el día
 * había que seleccionar y sobrescribir.
 *
 * ── Por qué hace falta un borrador ──────────────────────────────────────────
 * Porque un campo de texto tiene estados que el dato no tiene. «Vacío» es uno
 * de ellos: no es un día válido, pero es por donde se pasa para escribir otro.
 * Atando lo que se ve al número recortado, esos estados intermedios no pueden
 * existir.
 *
 * Así que lo escrito vive aquí y el número sale de ello: mientras haya algo
 * escrito se avisa hacia arriba, y vacío no se avisa —se conserva el último
 * día válido—. Al salir del campo, lo que se ve vuelve a ser ese día: nadie se
 * queda con un campo en blanco y un dato que no coincide.
 *
 * ── Lo que NO cambia ────────────────────────────────────────────────────────
 * El recorte sigue siendo al escribir y no al guardar: un 45 que se queda en
 * pantalla hasta que alguien pulsa «Guardar» es un error que nadie ve hasta
 * que ya no está mirando el campo.
 */
function DayField({ day, onChange }: { day: number; onChange: (day: number) => void }) {
  const [draft, setDraft] = useState(String(day));

  // El día puede cambiar desde fuera —al abrir la ficha de otro concepto— y lo
  // que se ve tiene que seguirlo.
  useOnChange([day], () => setDraft(String(day)));

  return (
    <Field label={t('centers.recurrence.dayOfMonth')} id="dia-de-pago">
      <Input
        id="dia-de-pago"
        // `text` y no `number`: un campo numérico devuelve la cadena vacía
        // cuando su contenido no es un número válido —«3e», «--»—, así que lo
        // escrito y lo que se lee dejan de coincidir justo mientras se teclea.
        // Los dígitos los filtra la propia función.
        type="text"
        inputMode="numeric"
        maxLength={2}
        value={draft}
        onChange={(e) => {
          const digits = e.target.value.replace(/\D/g, '').slice(0, 2);
          setDraft(digits);
          if (digits !== '') onChange(clampDay(digits));
        }}
        // Al salir, lo que se ve vuelve a ser el día guardado: un campo en
        // blanco con un dato detrás es una mentira que solo se descubre al
        // volver a abrir la ficha.
        onBlur={() => setDraft(String(day))}
      />
    </Field>
  );
}

export function clampDay(draft: string): number {
  const depth = Number.parseInt(draft, 10);
  if (!Number.isFinite(depth)) return 1;
  return Math.min(31, Math.max(1, depth));
}

/**
 * Cuándo vuelve el pago, dicho entero.
 *
 * ── Por qué hace falta ──────────────────────────────────────────────────────
 * Un campo "día del mes" a solas es coherente con "cada mes" y con nada más:
 * en "cada año", ese día ¿de qué mes? La respuesta es que el mes lo pone el
 * ÚLTIMO PAGO —un anual vuelve doce meses después del anterior— y el día es
 * este. Eso no se adivina mirando un número suelto, así que se escribe.
 *
 * La alternativa era pedir también el mes, pero sería un dato que el sistema
 * ya tiene: obligaría a declarar dos veces lo mismo y a mantenerlos de
 * acuerdo.
 */
export function whenItRecurs(periodicity: Periodicity, day: number, month: number): string {
  if (periodicity === 'monthly') return t('centers.recurrence.summary.monthly', { day });
  if (periodicity === 'annual')
    return t('centers.recurrence.summary.annual', {
      day,
      month: (MONTHS[month - 1] ?? '').toLowerCase(),
    });

  const step = { bimonthly: 2, quarterly: 3, semiannual: 6 }[periodicity];

  // Los meses concretos, no "cada tres meses": es lo que hay que poder
  // comprobar de un vistazo antes de guardar.
  const months: string[] = [];
  for (let m = (month - 1) % step; m < 12; m += step) months.push((MONTHS[m] ?? '').toLowerCase());

  return t('centers.recurrence.summary.everyFew', { day, months: months.join(', ') });
}

/**
 * Qué va a pasar en los meses que no llegan a ese día.
 *
 * Se dice ANTES de que ocurra, y con los meses concretos. "Se ajusta en los
 * meses cortos" obliga a imaginarse cuáles; "en febrero será el 28" no.
 */
export function shortMonthNotice(day: number): string {
  if (day <= 28) return '';

  if (day === 29) {
    return t('centers.recurrence.february28');
  }

  const thirtyDays = day === 31 ? t('centers.recurrence.also30') : '';
  return t('centers.recurrence.february2829', { thirtyDays });
}

function InstallmentsSwitch({ value, onChange }: RecurrenceFieldProps) {
  return (
    <label
      className={cn(
        'flex items-center gap-3 rounded-lg border border-border bg-card p-3',
        value.isAutoPay ? 'cursor-not-allowed opacity-60' : 'cursor-pointer',
        value.periodicity === 'monthly' ? 'sm:col-span-2' : 'sm:col-span-3',
      )}
    >
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium">{t('centers.recurrence.inInstalments')}</span>
        <span className="mt-0.5 block text-xs text-muted-foreground">
          {value.isAutoPay
            ? t('centers.recurrence.instalmentsNoAuto')
            : value.budget.trim() === ''
              ? t('centers.recurrence.instalmentsAverage')
              : t('centers.recurrence.instalmentsBudget')}
        </span>
      </span>

      <Switch
        checked={value.isMultiPayment}
        disabled={value.isAutoPay}
        onChange={(e) => onChange({ ...value, isMultiPayment: e.target.checked })}
      />
    </label>
  );
}

function AutoPaySwitch({ value, onChange }: RecurrenceFieldProps) {
  return (
    <label
      className={cn(
        'flex cursor-pointer items-center gap-3 rounded-lg border border-border bg-card p-3',
        value.periodicity === 'monthly' ? 'sm:col-span-2' : 'sm:col-span-3',
      )}
    >
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium">{t('centers.recurrence.autoPay')}</span>
        <span className="mt-0.5 block text-xs text-muted-foreground">
          {value.budget.trim() === ''
            ? t('centers.recurrence.autoPayAverage')
            : t('centers.recurrence.autoPayBudget')}
        </span>
      </span>

      <Switch
        checked={value.isAutoPay}
        disabled={value.isMultiPayment}
        onChange={(e) => onChange({ ...value, isAutoPay: e.target.checked })}
      />
    </label>
  );
}

function BudgetField({ value, onChange }: RecurrenceFieldProps) {
  return (
    <Field
      label={t('centers.recurrence.budget')}
      id="presupuesto"
      description={
        value.budget.trim() === ''
          ? t('centers.recurrence.budgetEmptyHelp')
          : t('centers.recurrence.budgetHelp')
      }
      className={value.periodicity === 'monthly' ? 'sm:col-span-2' : 'sm:col-span-3'}
    >
      <MoneyField
        id="presupuesto"
        value={value.budget}
        onValueChange={(budget) => onChange({ ...value, budget })}
        placeholder={t('centers.recurrence.optional')}
      />
    </Field>
  );
}

/** Once a year it is THE month; every few months, the month the cycle starts on. */
const monthLabel = (periodicity: Periodicity): string =>
  periodicity === 'annual' ? t('centers.recurrence.month') : t('centers.recurrence.cycleMonth');

/** Lo que aparece debajo del interruptor cuando el pago es recurrente. */
function RecurrenceDetails({ value, onChange }: RecurrenceFieldProps) {
  return (
    <div
      className={cn(
        'grid gap-3 rounded-b-lg border-t border-border bg-muted/40 p-3',
        // Tantas columnas como campos haya: con dos columnas fijas, el
        // tercer campo se quedaba solo en un renglón a media anchura, y la
        // fila parecía cortada por la mitad.
        value.periodicity === 'monthly' ? 'sm:grid-cols-2' : 'sm:grid-cols-3',
      )}
    >
      <Field label={t('centers.recurrence.howOften')} id="periodicidad">
        <Select
          id="periodicidad"
          label={t('centers.recurrence.periodicity.label')}
          value={value.periodicity}
          options={PERIODICITIES.map((p) => ({ value: p, label: LABELS[p] }))}
          onChange={(v) => onChange({ ...value, periodicity: v as Periodicity })}
        />
      </Field>

      {value.periodicity !== 'monthly' && (
        <Field label={monthLabel(value.periodicity)} id="mes-de-pago">
          <Select
            id="mes-de-pago"
            label={t('centers.recurrence.month')}
            value={String(value.paymentMonth)}
            options={MONTHS.map((m, i) => ({ value: String(i + 1), label: m }))}
            onChange={(v) => onChange({ ...value, paymentMonth: Number(v) })}
          />
        </Field>
      )}

      <DayField
        day={value.paymentDay}
        onChange={(paymentDay) => onChange({ ...value, paymentDay })}
      />

      {/*
        ── Cuánto, debajo de cuándo ────────────────────────────────────
        A todo el ancho y en su propio renglón, no como una columna más de
        la rejilla de arriba. Ahí se contesta CUÁNDO vuelve —cada cuánto,
        qué mes, qué día—, que son tres formas de la misma pregunta; esto
        es otra, y en la misma fila se leería como un cuarto ajuste del
        calendario.
      */}
      <BudgetField value={value} onChange={onChange} />

      {/*
        ── Que se cobre solo ───────────────────────────────────────────
        Debajo del presupuesto y no arriba, porque depende de él para ser
        una buena idea: sin presupuesto, el movimiento se crea con el
        promedio de los meses anteriores, que es una estimación. Se permite
        igual —hay gastos que varían y aun así se domicilian— y por eso el
        movimiento que se crea lo DICE en sus notas.

        Una fila entera con su explicación, como el interruptor de arriba,
        y no un campo más de la rejilla: enciende un comportamiento, no
        guarda un dato.
      */}
      <AutoPaySwitch value={value} onChange={onChange} />

      {/*
        ── Que se cubra a pedazos ──────────────────────────────────────
        Debajo del pago automático porque son las dos caras de la misma
        pregunta —«¿cómo se salda esto?»— y porque se excluyen: el de
        arriba dice que se cobra solo, entero, el día que vence; este dice
        que se cubre en varias idas y no se sabe cuántas.

        Se EXCLUYEN en la pantalla, y no solo en el servidor. Dejar los dos
        encendibles para que la API conteste 422 es hacer que la regla se
        descubra fallando; apagar el otro al encender uno sería cambiarle
        a alguien un ajuste que no tocó. Lo que queda es decirlo: el que no
        se puede usar está apagado y explica por qué.
      */}
      <InstallmentsSwitch value={value} onChange={onChange} />

      <WhenItReturns value={value} />
    </div>
  );
}

interface RecurrenceFieldProps {
  value: Recurrence;
  onChange: (next: Recurrence) => void;
}

/** Cuándo vuelve, dicho con palabras. */
function WhenItReturns({ value }: { value: Recurrence }) {
  return (
    <p
      className={cn(
        'text-xs text-muted-foreground',
        value.periodicity === 'monthly' ? 'sm:col-span-2' : 'sm:col-span-3',
      )}
    >
      {whenItRecurs(value.periodicity, value.paymentDay, value.paymentMonth)}{' '}
      {shortMonthNotice(value.paymentDay)}
    </p>
  );
}
