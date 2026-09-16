import { CalendarDays } from 'lucide-react';

import { Calendario } from '@/components/calendario';
import { Menu } from '@/components/menu';
import { disparadorDeCampo, useDentroDeUnCampo } from '@/components/ui/campo';
import { diaLargo } from '@/lib/fechas';
import { cn } from '@/lib/utils';

/**
 * Un día, elegido en el calendario de la app.
 *
 * ── Por qué no `<input type="date">` ────────────────────────────────────────
 * Porque el que abre es el del SISTEMA OPERATIVO: su tipografía, sus colores,
 * su idioma y su semana empezando en domingo. En medio de un formulario verde
 * aparece un cuadro gris de Windows o de macOS, y el mismo formulario se ve
 * distinto en cada máquina.
 *
 * Es la misma rejilla del filtro de fechas, con un solo extremo en vez de dos.
 *
 * ── Por qué va sobre `Menu` ─────────────────────────────────────────────────
 * Porque tenía su propio mecanismo de abrir y cerrar —su estado, su escucha
 * del clic de fuera, su Escape— y su panel colocado en ABSOLUTO. Eso último
 * era un fallo que se veía: dentro de la ficha de un movimiento, el cuerpo del
 * modal se desplaza, y un cuerpo que se desplaza recorta lo que se salga de
 * él. Y recorta en los DOS ejes: al declarar `overflow-y`, el navegador
 * convierte el `overflow-x: visible` en `auto`. Así que el calendario
 * aparecía cortado por abajo y por la derecha, sin la última semana y sin el
 * botón del mes siguiente.
 *
 * `Menu` ya resolvió eso con `flotante`: coloca el panel contra la VENTANA, no
 * contra su caja. De paso se van treinta líneas de mecánica duplicada y
 * entran gratis la superficie compartida y la animación de aparición.
 *
 * ── Y `anchoPropio` ────────────────────────────────────────────────────────
 * Un panel flotante copia por defecto el ancho de su disparador, que es lo
 * correcto para una lista de opciones. Un calendario no: necesita siete
 * columnas, y al ancho de un campo de formulario los días quedarían de tres
 * píxeles.
 */
export function SelectorDeDia({
  id,
  valor,
  onElegir,
  requerido = false,
  deshabilitado = false,
}: {
  id?: string;
  /** `YYYY-MM-DD`. */
  valor: string;
  onElegir: (iso: string) => void;
  requerido?: boolean;
  /** Se pinta igual pero no abre nada: es un dato que se lee, no se elige. */
  deshabilitado?: boolean;
}) {
  const enCampo = useDentroDeUnCampo();

  /*
    El valor y, a la derecha, el calendario.

    ── El calendario va al FINAL, y no hay flecha ──────────────────────────
    Antes llevaba las dos cosas: el calendario delante del valor y una flecha
    detrás. Sobraba una.

    El calendario no es informativo —no hace falta un dibujo para saber que un
    campo que dice "4 de abril de 2022" es una fecha—: es la señal de que ESTO
    ABRE UN CALENDARIO, que es justo el papel que cumple una flecha en un
    desplegable. Dos iconos para decir lo mismo, uno a cada lado.

    Así que se queda el que dice más, y se queda donde va lo que abre algo: a
    la derecha, en el mismo sitio donde el `Select` y el `Combo` ponen su
    flecha. No gira: una flecha invertida dice "esto está abierto", un
    calendario boca abajo no dice nada.
  */
  const dentro = (
    <>
      <span
        data-lleno={valor ? 'si' : 'no'}
        data-vacio={valor ? undefined : ''}
        className={cn('min-w-0 flex-1 truncate font-normal', enCampo && 'pt-4')}
      >
        {valor ? diaLargo(valor) : 'Elige una fecha'}
      </span>

      <CalendarDays className="size-4 shrink-0 opacity-70" aria-hidden="true" />
    </>
  );

  /*
    El valor viaja además en un campo oculto para que el formulario lo envíe y
    `required` siga funcionando: un botón no es un campo, y sin esto el
    navegador no tendría nada que validar.
  */
  const oculto = <input type="hidden" name={id} value={valor} required={requerido} />;

  if (deshabilitado) {
    // Apagado no puede ser un botón que abre nada: se pinta igual pero sin
    // desplegable detrás, para que el foco no caiga en una trampa.
    return (
      <>
        {oculto}
        <span id={id} aria-disabled="true" className={cn(disparadorDeCampo(), 'opacity-50')}>
          {dentro}
        </span>
      </>
    );
  }

  return (
    <>
      {oculto}
      <Menu
        etiqueta="Elegir fecha"
        tipo="panel"
        alineado="izquierda"
        flotante
        anchoPropio
        // El calendario trae su propio relleno: con el del menú encima queda
        // el doble por los cuatro lados.
        sinRelleno
        ancho="w-[min(20rem,calc(100vw-2rem))]"
        idDisparador={id}
        claseCaja="w-full min-w-0"
        claseDisparador={disparadorDeCampo()}
        disparador={() => dentro}
      >
        {(cerrar) => (
          <Calendario
            className="p-3"
            desde={valor || undefined}
            hasta={valor || undefined}
            onDia={(iso) => {
              onElegir(iso);
              // Un solo día no necesita confirmarse: con el segundo clic ya no
              // queda nada por decidir.
              cerrar();
            }}
          />
        )}
      </Menu>
    </>
  );
}
