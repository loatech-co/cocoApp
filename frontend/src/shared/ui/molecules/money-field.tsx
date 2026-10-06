import { type ComponentProps } from 'react';

import { agruparMiles, cn, soloCifras } from '@/shared/lib/utils';
import { Input } from '@/shared/ui/atoms/input';

/**
 * Un campo donde se escribe plata.
 *
 * ── Los miles se agrupan MIENTRAS se escribe ────────────────────────────────
 * «453132» no se lee: hay que contar los dígitos de tres en tres con el dedo
 * para saber si son cuatrocientos mil o cuatro millones. Es el dato más
 * importante de cualquier ficha que hable de dinero y es el único que no se
 * podía leer de un vistazo.
 *
 * Se GUARDA sin puntos y se ENSEÑA con ellos: el valor que viaja a la API es
 * el que se teclea, no lo que se ve.
 *
 * ── Y el cursor se queda donde estaba ───────────────────────────────────────
 * Es la mitad difícil, y por eso esto es un componente y no dos llamadas
 * parecidas. Al reagrupar, la cadena pintada cambia de largo, y si el cursor
 * se deja donde el navegador lo dejó salta al final en cuanto aparece un punto
 * nuevo: corregir una cifra por la mitad se vuelve imposible.
 *
 * Lo que se conserva no es la posición sino CUÁNTOS DÍGITOS hay antes del
 * cursor, que es lo único que no cambia al reagrupar.
 *
 * ── Por qué no es `type="number"` ───────────────────────────────────────────
 * Traería flechitas que nadie usa y rechazaría la coma decimal que se escribe
 * en Colombia. `inputMode="decimal"` abre el teclado numérico del teléfono sin
 * ninguna de las dos cosas.
 */
export function MoneyField({
  value,
  onValueChange,
  className,
  ...rest
}: {
  /** Solo cifras, sin puntos. Es lo que viaja a la API. */
  value: string;
  onValueChange: (raw: string) => void;
} & Omit<ComponentProps<typeof Input>, 'value' | 'onChange' | 'type' | 'icono'>) {
  return (
    <Input
      inputMode="decimal"
      icon={PesoSign}
      value={agruparMiles(value)}
      className={cn(className)}
      onChange={(e) => {
        const digits = soloCifras(e.target.value);
        const input = e.target;
        const digitsBefore = (input.value.slice(0, input.selectionStart ?? 0).match(/[\d,]/g) ?? [])
          .length;

        onValueChange(digits);

        requestAnimationFrame(() => {
          const formatted = agruparMiles(digits);
          let seen = 0;
          let caret = formatted.length;
          for (let i = 0; i < formatted.length; i += 1) {
            if (/[\d,]/.test(formatted.charAt(i))) seen += 1;
            if (seen === digitsBefore) {
              caret = i + 1;
              break;
            }
          }
          input.setSelectionRange(caret, caret);
        });
      }}
      {...rest}
    />
  );
}

/**
 * El signo de pesos, a la izquierda.
 *
 * ── Por qué un signo y no la palabra ────────────────────────────────────────
 * Porque «Valor» ya está en la etiqueta del campo, y lo que hace falta a la
 * izquierda del número es decir que ESTO es dinero: al lado puede haber otro
 * número —el día del mes de una recurrencia— que se escribe igual.
 *
 * Es el `icono` del campo, así que no forma parte del valor: lo que se teclea
 * y lo que se guarda no lo llevan.
 */
function PesoSign({ className }: { className?: string }) {
  return (
    <span
      className={cn(className, 'grid place-items-center text-sm font-medium')}
      aria-hidden="true"
    >
      $
    </span>
  );
}
