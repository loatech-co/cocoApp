import { Check, ChevronDown } from 'lucide-react';

import { Menu } from '@/components/menu';
import { cn } from '@/lib/utils';

export interface OpcionDeSelect {
  valor: string;
  etiqueta: string;
}

/**
 * Una lista desplegable, dibujada por la app.
 *
 * ── Por qué no es un `<select>` ─────────────────────────────────────────────
 * Porque su lista la pinta el SISTEMA OPERATIVO: su tipografía, sus colores,
 * su idioma y su flecha pegada al borde derecho. La misma pantalla se ve
 * distinta en cada máquina, y en medio de un formulario verde aparece un
 * cuadro gris de Windows.
 *
 * Está construida sobre `Menu`, que es quien sabe abrirse, cerrarse al tocar
 * fuera y cerrarse con Escape. Si esa mecánica se arregla, se arregla aquí y
 * en el filtro y en el menú de la cuenta a la vez.
 *
 * ── Qué se pierde y por qué se acepta ───────────────────────────────────────
 * El nativo en un teléfono abre la rueda de iOS o el diálogo de Android, que
 * están bien hechos. Se renuncia a eso a cambio de que la app se vea igual en
 * todas partes; a cambio, esta lista se desplaza, marca lo elegido y cierra al
 * elegir, que es lo que se usa el 99 % de las veces.
 */
export function Select({
  valor,
  onCambiar,
  opciones,
  etiqueta,
  vacio,
  tamano = 'md',
  deshabilitado = false,
  id,
  className,
}: {
  /** El valor elegido. `''` es "ninguno". */
  valor: string;
  onCambiar: (valor: string) => void;
  opciones: OpcionDeSelect[];
  /** Nombre accesible del campo. */
  etiqueta: string;
  /** Texto de la opción sin valor. Si se omite, elegir es obligatorio. */
  vacio?: string;
  /** Los mismos dos de toda la app: `sm` mide 36 y `md` mide 44. */
  tamano?: 'sm' | 'md';
  deshabilitado?: boolean;
  id?: string;
  className?: string;
}) {
  const pequeno = tamano === 'sm';
  const elegida = opciones.find((o) => o.valor === valor);
  const vacioEsPosible = vacio !== undefined;
  const sinNada = deshabilitado || (opciones.length === 0 && !vacioEsPosible);

  const disparador = (
    <>
      <span className={cn('min-w-0 flex-1 truncate text-left', !elegida && 'text-muted-foreground')}>
        {elegida?.etiqueta ?? vacio ?? '—'}
      </span>
      <ChevronDown className={cn('shrink-0 opacity-60', pequeno ? 'size-3.5' : 'size-4')} aria-hidden="true" />
    </>
  );

  if (sinNada) {
    // Deshabilitado no puede ser un botón que abre nada: se pinta igual pero
    // sin desplegable detrás, para que el foco no caiga en una trampa.
    return (
      <span
        className={cn(
          'flex w-full min-w-0 cursor-not-allowed items-center gap-2 rounded-lg border border-input',
          'bg-card opacity-50',
          'movil:min-h-[42px]',
          pequeno ? 'h-9 px-3 text-xs' : 'h-11 px-3 text-sm',
          className,
        )}
        aria-disabled="true"
      >
        {disparador}
      </span>
    );
  }

  return (
    <Menu
      etiqueta={etiqueta}
      tipo="lista"
      alineado="izquierda"
      // Los selectores viven en formularios, y un formulario largo se
      // desplaza: sin esto, el panel lo recorta la caja que lo contiene.
      flotante
      ancho="w-[max(12rem,100%)]"
      claseCaja={cn('w-full min-w-0', className)}
      claseDisparador={cn(
        // El borde es el de los CAMPOS —`--input`—, no el de los contenedores:
        // un desplegable se rellena, y tiene que pesar igual que el campo de
        // texto que lleva al lado en la misma fila.
        'flex w-full min-w-0 items-center gap-2 rounded-lg border border-input bg-card transition-colors',
        'hover:border-ring/40',
        'outline-none focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring',
        // El suelo táctil: apagado y encendido miden lo mismo, o la fila salta
        // al deshabilitarse.
        'movil:min-h-[42px]',
        // El relleno de la derecha es igual al de la izquierda porque la flecha
        // ya está dentro del flex: no hay nada que esquivar.
        pequeno ? 'h-9 px-3 text-xs' : 'h-11 px-3 text-sm',
      )}
      disparador={() => disparador}
    >
      {(cerrar) => (
        <ul className="max-h-64 overflow-y-auto" id={id}>
          {vacioEsPosible && (
            <Opcion
              elegida={valor === ''}
              onClick={() => {
                onCambiar('');
                cerrar();
              }}
            >
              <span className="text-muted-foreground">{vacio}</span>
            </Opcion>
          )}

          {opciones.map((o) => (
            <Opcion
              key={o.valor}
              elegida={o.valor === valor}
              onClick={() => {
                onCambiar(o.valor);
                cerrar();
              }}
            >
              {o.etiqueta}
            </Opcion>
          ))}
        </ul>
      )}
    </Menu>
  );
}

function Opcion({
  elegida,
  onClick,
  children,
}: {
  elegida: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <li>
      <button
        type="button"
        role="option"
        aria-selected={elegida}
        onClick={onClick}
        className={cn(
          'flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm transition-colors',
          'movil:min-h-[42px]',
          // Quieta en `muted`, señalada en `accent`: con el mismo color para
          // las dos, pasar por encima de la opción ya elegida no cambia nada.
          elegida
            ? 'bg-muted font-medium hover:bg-accent hover:text-accent-foreground'
            : 'hover:bg-accent hover:text-accent-foreground',
        )}
      >
        <span className="min-w-0 flex-1 truncate">{children}</span>
        {elegida && <Check className="size-4 shrink-0 text-primary" aria-hidden="true" />}
      </button>
    </li>
  );
}
