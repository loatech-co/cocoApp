import { Repeat } from 'lucide-react';

import { Interruptor } from '@/components/ui/interruptor';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { PERIODICIDADES, type Periodicidad } from '@coco/types';
import { Campo } from '@/components/ui/campo';

const ETIQUETAS: Record<Periodicidad, string> = {
  mensual: 'Cada mes',
  bimestral: 'Cada dos meses',
  trimestral: 'Cada tres meses',
  semestral: 'Cada seis meses',
  anual: 'Cada año',
};

export interface Recurrencia {
  recurrente: boolean;
  periodicidad: Periodicidad;
  diaDePago: number;
  /** El mes del ciclo. Solo se usa —y se pregunta— si no es mensual. */
  mesDePago: number;
}

const MESES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
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
      {valor.recurrente && (
        <div
          className={cn(
            'grid gap-3 rounded-b-lg border-t border-border bg-muted/40 p-3',
            // Tantas columnas como campos haya: con dos columnas fijas, el
            // tercer campo se quedaba solo en un renglón a media anchura, y la
            // fila parecía cortada por la mitad.
            valor.periodicidad === 'mensual' ? 'sm:grid-cols-2' : 'sm:grid-cols-3',
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

          {valor.periodicidad !== 'mensual' && (
            <Campo
              etiqueta={valor.periodicidad === 'anual' ? 'Mes' : 'Mes del ciclo'}
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

          <Campo etiqueta="Día del mes" id="dia-de-pago">
            <Input
              id="dia-de-pago"
              type="number"
              inputMode="numeric"
              min={1}
              max={31}
              value={valor.diaDePago}
              // Se recorta al ESCRIBIR, no al guardar: un 45 que se queda en
              // pantalla hasta que uno pulsa guardar es un error que nadie ve
              // hasta que ya no está mirando el campo.
              onChange={(e) => onCambiar({ ...valor, diaDePago: entre1y31(e.target.value) })}
              className="[appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
            />
          </Campo>

          <p
            className={cn(
              'text-xs text-muted-foreground',
              valor.periodicidad === 'mensual' ? 'sm:col-span-2' : 'sm:col-span-3',
            )}
          >
            {cuandoVuelve(valor.periodicidad, valor.diaDePago, valor.mesDePago)} {avisoDeMesCorto(valor.diaDePago)}
          </p>
        </div>
      )}
    </div>
  );
}

/**
 * El día escrito, encajado entre 1 y 31.
 *
 * Vacío cuenta como 1 en vez de quedar en blanco: un campo numérico sin valor
 * deja el formulario en un estado que no se puede guardar y no lo dice.
 */
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
  if (periodicidad === 'mensual') return `Todos los meses el día ${dia}.`;
  if (periodicidad === 'anual') return `Cada ${dia} de ${MESES[mes - 1].toLowerCase()}.`;

  const cada = { bimestral: 2, trimestral: 3, semestral: 6 }[periodicidad];

  // Los meses concretos, no "cada tres meses": es lo que hay que poder
  // comprobar de un vistazo antes de guardar.
  const meses: string[] = [];
  for (let m = (mes - 1) % cada; m < 12; m += cada) meses.push(MESES[m].toLowerCase());

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
