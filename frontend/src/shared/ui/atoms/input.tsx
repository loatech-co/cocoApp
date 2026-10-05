import type { ComponentProps, ComponentType, ReactNode } from 'react';

import { cn } from '@/shared/lib/utils';
import {
  FOCO_DEL_CAMPO,
  HUECO_DE_LA_ETIQUETA,
  useDentroDeUnCampo,
} from '@/shared/ui/foundations/field';

/**
 * Un campo de texto.
 *
 * ── Los mismos DOS tamaños que el botón ─────────────────────────────────────
 * `sm` mide 36 y `md` mide 44, y son los mismos dos de `button.tsx`, del
 * `Select`, del `Combo` y del selector de fecha. Una fila donde el botón mide
 * 44, el campo 40 y el desplegable 36 se ve temblorosa aunque nadie sepa
 * señalar por qué.
 *
 * ── Los iconos: uno a la izquierda, hasta dos a la derecha ──────────────────
 * No son el mismo papel y por eso son dos propiedades y no una lista:
 *
 * · `icono` es INFORMATIVO. Dice de qué es el campo —una persona, una lupa, un
 *   calendario— y no se puede pulsar. Va a la izquierda, que es donde empieza
 *   a leerse.
 * · `acciones` son ACTIVAS. Hacen algo: borrar lo escrito, desplegar una
 *   lista, enseñar la contraseña. Van a la derecha, donde está el pulgar en un
 *   teléfono y donde no estorban al texto que se escribe.
 *
 * Es una LISTA y no un `ReactNode` suelto a propósito: el campo necesita saber
 * CUÁNTAS son para reservarles sitio con su relleno derecho, y contar los
 * hijos de un fragmento no se puede hacer de forma fiable. Dos es el tope
 * —limpiar y buscar, limpiar y desplegar—; con tres, la mitad del campo son
 * botones.
 *
 * ── Por qué los iconos van en absoluto y no en una fila ─────────────────────
 * Porque un `<input>` no puede tener hijos: es un elemento vacío. Un
 * desplegable sí puede, y por eso allí los iconos van en la fila y no hace
 * falta reservar nada.
 */
export function Input({
  className,
  type,
  tamano = 'md',
  icono: Icono,
  acciones,
  placeholder,
  ...props
}: ComponentProps<'input'> & {
  tamano?: 'sm' | 'md';
  /** A la izquierda, informativo: de qué es este campo. */
  icono?: ComponentType<{ className?: string; 'aria-hidden'?: boolean }>;
  /** A la derecha, activas. Una o dos. */
  acciones?: ReactNode[];
}) {
  const derecha = acciones?.filter(Boolean) ?? [];
  // Dentro de un `Campo`, el valor baja para dejarle sitio a la etiqueta.
  const enCampo = useDentroDeUnCampo();

  const campo = (
    <input
      type={type}
      /*
        Siempre hay un marcador, aunque sea un espacio.

        Es lo que hace que `:placeholder-shown` funcione, y de ahí sale el
        estado «este campo tiene algo escrito» que sube la etiqueta flotante.
        Sin atributo, el selector no engancha nunca y la etiqueta se queda
        arriba desde el principio, tapando un campo vacío.
      */
      placeholder={placeholder ?? ' '}
      className={cn(
        'flex w-full rounded-lg border border-input bg-card px-3',
        tamano === 'sm' ? 'h-9 text-sm' : 'h-11 text-base',
        // El suelo táctil, aunque en `md` sobre: 44 ya pasa de 42. Se declara
        // igual porque `piso-tactil.test.ts` pide que quien dibuja un control
        // lo diga, y el día que alguien baje este alto el suelo sigue puesto.
        'movil:min-h-[42px]',
        /*
          Dentro de un campo, el marcador SOLO se ve con el foco: en reposo su
          sitio lo ocupa la etiqueta, y los dos a la vez son dos textos grises
          pisándose —que es exactamente lo que pasaba—.

          Va aquí y no en la hoja de estilos porque una utilidad le gana a la
          capa `components`, y esta clase es justo la que ganaba.
        */
        enCampo
          ? 'placeholder:text-transparent focus:placeholder:text-muted-foreground'
          : 'placeholder:text-muted-foreground',
        // Al pasar por encima se tiñe el BORDE, igual que el `Select` y el
        // `Combo` que lleva al lado. Sin esto, en una misma fila un control
        // respondía al ratón y el de al lado no, y parecía que uno estaba
        // apagado.
        'transition-colors hover:border-ring/40',
        // El porqué del grosor y de `:focus-visible`, en `campo.tsx`.
        FOCO_DEL_CAMPO,
        'disabled:cursor-not-allowed disabled:opacity-50',
        'aria-invalid:border-destructive aria-invalid:focus-visible:ring-destructive',
        // 16px por debajo del corte y 14 por encima, y el corte es el de la
        // app —no el `md:` de Tailwind, que mide solo el ancho—: una tableta
        // en vertical es táctil aunque mida 800, y Safari amplía la página
        // entera al enfocar un campo de menos de 16px.
        tamano === 'md' && 'escritorio:text-sm',
        // Sitio para los iconos. A la izquierda: 12 de margen, 16 de icono y 8
        // de aire. A la derecha, lo mismo por cada botón de 28.
        Icono && 'pl-9',
        derecha.length === 1 && 'pr-11',
        derecha.length >= 2 && 'pr-19',
        enCampo && HUECO_DE_LA_ETIQUETA,
        className,
      )}
      {...props}
    />
  );

  if (!Icono && derecha.length === 0) return campo;

  return (
    <span className="relative block">
      {campo}

      {Icono && (
        <span
          // `data-icono` es lo que le dice a la etiqueta flotante que tiene que
          // arrancar más a la derecha. Lo lee `.campo` en `index.css`.
          data-icono=""
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
        >
          <Icono className="size-4" aria-hidden={true} />
        </span>
      )}

      {derecha.length > 0 && (
        <span className="absolute right-2 top-1/2 flex -translate-y-1/2 items-center gap-1">
          {derecha.map((accion, i) => (
            // El índice como clave: esta lista no se reordena ni se filtra,
            // son uno o dos botones fijos que el campo declara al construirse.
            // eslint-disable-next-line @eslint-react/no-array-index-key -- lista fija y posicional, sin id propio
            <span key={i}>{accion}</span>
          ))}
        </span>
      )}
    </span>
  );
}
