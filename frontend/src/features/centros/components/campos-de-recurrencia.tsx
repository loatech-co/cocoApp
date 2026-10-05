import { Repeat } from 'lucide-react';
import { useState } from 'react';

import { PERIODICIDADES, type Periodicidad } from '@/features/centros/model/periodicity';
import { useAlCambiar } from '@/shared/lib/al-cambiar';
import { cn } from '@/shared/lib/utils';
import { Campo } from '@/shared/ui/atoms/campo';
import { Input } from '@/shared/ui/atoms/input';
import { Interruptor } from '@/shared/ui/atoms/interruptor';
import { CampoDeDinero } from '@/shared/ui/molecules/campo-de-dinero';
import { Select } from '@/shared/ui/organisms/select';

const ETIQUETAS: Record<Periodicidad, string> = {
  monthly: 'Cada mes',
  bimonthly: 'Cada dos meses',
  quarterly: 'Cada tres meses',
  semiannual: 'Cada seis meses',
  annual: 'Cada año',
};

export interface Recurrencia {
  recurrente: boolean;
  periodicidad: Periodicidad;
  diaDePago: number;
  /** El mes del ciclo. Solo se usa —y se pregunta— si no es mensual. */
  mesDePago: number;
  /**
   * Lo que se espera que cueste cada vez. Solo cifras, sin puntos; vacío es
   * «no lo sé, estímalo».
   */
  presupuesto: string;
  /** Si el movimiento se crea solo al llegar el día de pago. */
  pagoAutomatico: boolean;
  /**
   * Si el concepto se cubre a pedazos: el mercado en cuatro idas, la gasolina
   * en seis tanqueadas. Se queda en pagos pendientes hasta que lo pagado
   * alcanza lo esperado, en vez de salirse al primer movimiento.
   *
   * Incompatible con `pagoAutomatico`: ver el porqué junto al interruptor.
   */
  variosPagos: boolean;
}

const MESES = [
  'Enero',
  'Febrero',
  'Marzo',
  'Abril',
  'Mayo',
  'Junio',
  'Julio',
  'Agosto',
  'Septiembre',
  'Octubre',
  'Noviembre',
  'Diciembre',
];

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
export function CamposDeRecurrencia({
  valor,
  onCambiar,
  /** El nombre del concepto, para que el aviso diga a qué afecta. */
  concepto,
  className,
}: {
  valor: Recurrencia;
  onCambiar: (siguiente: Recurrencia) => void;
  concepto?: string;
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
          <span className="block text-sm font-medium">Pago recurrente</span>
          <span className="mt-0.5 block text-xs text-muted-foreground">
            {concepto
              ? `Aplica a "${concepto}", no solo a este movimiento`
              : 'Aparece en los pendientes del mes hasta que se registre'}
          </span>
        </span>

        <Interruptor
          checked={valor.recurrente}
          onChange={(e) => onCambiar({ ...valor, recurrente: e.target.checked })}
        />
      </label>

      {/*
        Los campos solo existen si está encendido, y CUÁLES depende de cada
        cuánto vuelve. "Cada tres meses" con un solo día del mes no dice nada:
        ¿tres meses contados desde cuándo? Por eso, en cuanto deja de ser
        mensual, aparece el mes del ciclo.
      */}
      {valor.recurrente && <RecurrenceDetails valor={valor} onCambiar={onCambiar} />}
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
function CampoDelDia({ dia, onCambiar }: { dia: number; onCambiar: (dia: number) => void }) {
  const [escrito, setEscrito] = useState(String(dia));

  // El día puede cambiar desde fuera —al abrir la ficha de otro concepto— y lo
  // que se ve tiene que seguirlo.
  useAlCambiar([dia], () => setEscrito(String(dia)));

  return (
    <Campo etiqueta="Día del mes" id="dia-de-pago">
      <Input
        id="dia-de-pago"
        // `text` y no `number`: un campo numérico devuelve la cadena vacía
        // cuando su contenido no es un número válido —«3e», «--»—, así que lo
        // escrito y lo que se lee dejan de coincidir justo mientras se teclea.
        // Los dígitos los filtra la propia función.
        type="text"
        inputMode="numeric"
        maxLength={2}
        value={escrito}
        onChange={(e) => {
          const limpio = e.target.value.replace(/\D/g, '').slice(0, 2);
          setEscrito(limpio);
          if (limpio !== '') onCambiar(entre1y31(limpio));
        }}
        // Al salir, lo que se ve vuelve a ser el día guardado: un campo en
        // blanco con un dato detrás es una mentira que solo se descubre al
        // volver a abrir la ficha.
        onBlur={() => setEscrito(String(dia))}
      />
    </Campo>
  );
}

export function entre1y31(escrito: string): number {
  const numero = Number.parseInt(escrito, 10);
  if (!Number.isFinite(numero)) return 1;
  return Math.min(31, Math.max(1, numero));
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
export function cuandoVuelve(periodicidad: Periodicidad, dia: number, mes: number): string {
  if (periodicidad === 'monthly') return `Todos los meses el día ${dia}.`;
  if (periodicidad === 'annual') return `Cada ${dia} de ${(MESES[mes - 1] ?? '').toLowerCase()}.`;

  const cada = { bimonthly: 2, quarterly: 3, semiannual: 6 }[periodicidad];

  // Los meses concretos, no "cada tres meses": es lo que hay que poder
  // comprobar de un vistazo antes de guardar.
  const meses: string[] = [];
  for (let m = (mes - 1) % cada; m < 12; m += cada) meses.push((MESES[m] ?? '').toLowerCase());

  return `El día ${dia} de ${meses.join(', ')}.`;
}

/**
 * Qué va a pasar en los meses que no llegan a ese día.
 *
 * Se dice ANTES de que ocurra, y con los meses concretos. "Se ajusta en los
 * meses cortos" obliga a imaginarse cuáles; "en febrero será el 28" no.
 */
export function avisoDeMesCorto(dia: number): string {
  if (dia <= 28) return '';

  if (dia === 29) {
    return 'En febrero será el 28, salvo en años bisiestos.';
  }

  const deTreinta = dia === 31 ? ' y el 30 en abril, junio, septiembre y noviembre' : '';
  return `En febrero será el 28 —29 en bisiestos—${deTreinta}.`;
}

function InstallmentsSwitch({ valor, onCambiar }: RecurrenceFieldProps) {
  return (
    <label
      className={cn(
        'flex items-center gap-3 rounded-lg border border-border bg-card p-3',
        valor.pagoAutomatico ? 'cursor-not-allowed opacity-60' : 'cursor-pointer',
        valor.periodicidad === 'monthly' ? 'sm:col-span-2' : 'sm:col-span-3',
      )}
    >
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium">Se paga en varias veces</span>
        <span className="mt-0.5 block text-xs text-muted-foreground">
          {valor.pagoAutomatico
            ? 'No se puede junto al pago automático: ese registra el valor entero el día de pago.'
            : valor.presupuesto.trim() === ''
              ? 'Sigue en pagos pendientes hasta cubrir el promedio de los meses anteriores.'
              : 'Sigue en pagos pendientes, mostrando lo que lleva, hasta cubrir el presupuesto.'}
        </span>
      </span>

      <Interruptor
        checked={valor.variosPagos}
        disabled={valor.pagoAutomatico}
        onChange={(e) => onCambiar({ ...valor, variosPagos: e.target.checked })}
      />
    </label>
  );
}

function AutoPaySwitch({ valor, onCambiar }: RecurrenceFieldProps) {
  return (
    <label
      className={cn(
        'flex cursor-pointer items-center gap-3 rounded-lg border border-border bg-card p-3',
        valor.periodicidad === 'monthly' ? 'sm:col-span-2' : 'sm:col-span-3',
      )}
    >
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium">Pago automático</span>
        <span className="mt-0.5 block text-xs text-muted-foreground">
          {valor.presupuesto.trim() === ''
            ? 'El movimiento se registra solo el día de pago, con el promedio de los meses anteriores.'
            : 'El movimiento se registra solo el día de pago, por el presupuesto.'}
        </span>
      </span>

      <Interruptor
        checked={valor.pagoAutomatico}
        disabled={valor.variosPagos}
        onChange={(e) => onCambiar({ ...valor, pagoAutomatico: e.target.checked })}
      />
    </label>
  );
}

function BudgetField({ valor, onCambiar }: RecurrenceFieldProps) {
  return (
    <Campo
      etiqueta="Presupuesto"
      id="presupuesto"
      ayuda={
        valor.presupuesto.trim() === ''
          ? 'Vacío: se estima con el promedio de los meses anteriores.'
          : 'Este valor se usa cada mes, en vez del promedio.'
      }
      className={valor.periodicidad === 'monthly' ? 'sm:col-span-2' : 'sm:col-span-3'}
    >
      <CampoDeDinero
        id="presupuesto"
        valor={valor.presupuesto}
        onCambiar={(presupuesto) => onCambiar({ ...valor, presupuesto })}
        placeholder="Opcional"
      />
    </Campo>
  );
}

/** Lo que aparece debajo del interruptor cuando el pago es recurrente. */
function RecurrenceDetails({ valor, onCambiar }: RecurrenceFieldProps) {
  return (
    <div
      className={cn(
        'grid gap-3 rounded-b-lg border-t border-border bg-muted/40 p-3',
        // Tantas columnas como campos haya: con dos columnas fijas, el
        // tercer campo se quedaba solo en un renglón a media anchura, y la
        // fila parecía cortada por la mitad.
        valor.periodicidad === 'monthly' ? 'sm:grid-cols-2' : 'sm:grid-cols-3',
      )}
    >
      <Campo etiqueta="Cada cuánto" id="periodicidad">
        <Select
          id="periodicidad"
          etiqueta="Periodicidad"
          valor={valor.periodicidad}
          opciones={PERIODICIDADES.map((p) => ({ valor: p, etiqueta: ETIQUETAS[p] }))}
          onCambiar={(v) => onCambiar({ ...valor, periodicidad: v as Periodicidad })}
        />
      </Campo>

      {valor.periodicidad !== 'monthly' && (
        <Campo
          etiqueta={valor.periodicidad === 'annual' ? 'Mes' : 'Mes del ciclo'}
          id="mes-de-pago"
        >
          <Select
            id="mes-de-pago"
            etiqueta="Mes"
            valor={String(valor.mesDePago)}
            opciones={MESES.map((m, i) => ({ valor: String(i + 1), etiqueta: m }))}
            onCambiar={(v) => onCambiar({ ...valor, mesDePago: Number(v) })}
          />
        </Campo>
      )}

      <CampoDelDia
        dia={valor.diaDePago}
        onCambiar={(diaDePago) => onCambiar({ ...valor, diaDePago })}
      />

      {/*
        ── Cuánto, debajo de cuándo ────────────────────────────────────
        A todo el ancho y en su propio renglón, no como una columna más de
        la rejilla de arriba. Ahí se contesta CUÁNDO vuelve —cada cuánto,
        qué mes, qué día—, que son tres formas de la misma pregunta; esto
        es otra, y en la misma fila se leería como un cuarto ajuste del
        calendario.
      */}
      <BudgetField valor={valor} onCambiar={onCambiar} />

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
      <AutoPaySwitch valor={valor} onCambiar={onCambiar} />

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
      <InstallmentsSwitch valor={valor} onCambiar={onCambiar} />

      <WhenItReturns valor={valor} />
    </div>
  );
}

interface RecurrenceFieldProps {
  valor: Recurrencia;
  onCambiar: (siguiente: Recurrencia) => void;
}

/** Cuándo vuelve, dicho con palabras. */
function WhenItReturns({ valor }: { valor: Recurrencia }) {
  return (
    <p
      className={cn(
        'text-xs text-muted-foreground',
        valor.periodicidad === 'monthly' ? 'sm:col-span-2' : 'sm:col-span-3',
      )}
    >
      {cuandoVuelve(valor.periodicidad, valor.diaDePago, valor.mesDePago)}{' '}
      {avisoDeMesCorto(valor.diaDePago)}
    </p>
  );
}
