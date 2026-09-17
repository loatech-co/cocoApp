import { LayoutGrid, Plus, Search } from 'lucide-react';
import type { ComponentType } from 'react';
import { NavLink } from 'react-router-dom';

import { Avatar, DASHBOARD } from '@/components/navegacion';
import { cn } from '@/lib/utils';

/**
 * La barra de abajo. La forma de llegar a lo del día a día con una mano.
 *
 * ── Cinco huecos, y cinco es un TECHO, no un objetivo ───────────────────────
 * Material limita una barra de navegación a cinco destinos y Apple limita una
 * de pestañas a cinco, los dos por lo mismo: el sexto deja todos los blancos
 * demasiado estrechos. A 375 de ancho, cinco huecos son 75×60.
 *
 * ── Uno solo es un destino; los otros cuatro son cosas que se HACEN ─────────
 *
 *   Inicio    la única sección de la barra
 *   Buscar    abre una hoja con el campo y los resultados dentro
 *   (+)       registra un gasto, sin pasar por ningún menú
 *   Atajos    las páginas que cada quien se arma
 *   Avatar    su hoja: el perfil, los ajustes y la salida
 *
 * Eran cuatro secciones y un botón, y estaba al revés de como se usa un
 * teléfono: lo que se hace veinte veces por semana —anotar un gasto, buscar
 * uno— quedaba a dos toques, y lo que se visita una vez al mes tenía su hueco
 * fijo. Las secciones que salieron de aquí siguen a un toque desde los atajos,
 * que es exactamente para lo que están.
 *
 * ── Por qué el (+) NO abre un menú ──────────────────────────────────────────
 * Porque solo hay una respuesta. El menú de «Nuevo movimiento» ofrece gasto e
 * ingreso, y el ingreso está apagado —«Pronto»—: en el teléfono eso es un
 * toque de más para elegir la única opción viva. En la pantalla ancha el menú
 * se queda, porque ahí el segundo toque no cuesta un gesto sino un clic, y el
 * día que el ingreso exista el menú ya está escrito.
 *
 * ── Solo iconos ─────────────────────────────────────────────────────────────
 * Cinco palabras de 12px bajo cinco dibujos son una segunda fila de texto
 * compitiendo con la página, y aplanarían la única jerarquía que la barra
 * tiene. Cada hueco lleva su nombre accesible.
 */
export function BarraInferior({
  nombre,
  busquedaAbierta,
  onBuscar,
  onNuevoGasto,
  atajosAbiertos,
  onAtajos,
  cuentaAbierta,
  onCuenta,
}: {
  nombre: string;
  busquedaAbierta: boolean;
  onBuscar: () => void;
  onNuevoGasto: () => void;
  atajosAbiertos: boolean;
  onAtajos: () => void;
  cuentaAbierta: boolean;
  onCuenta: () => void;
}) {
  return (
    <nav
      data-armazon="barra"
      aria-label="Accesos"
      className={cn(
        'fixed inset-x-0 bottom-0 flex items-stretch',
        // Por DEBAJO del techo, que va a 20, y a propósito: un desplegable
        // anclado al techo es hijo suyo, así que ningún z-index de dentro
        // puede ganarle a un hermano del techo. Las dos barras no se solapan
        // nunca —una está arriba y otra al pie—, así que no se pierde nada.
        'z-[15]',
        'bg-sidebar pb-[env(safe-area-inset-bottom,0px)]',
        // El relleno de abajo, y no más alto: la fila de la barra mide 60
        // exactos y el borde seguro del teléfono es hueco muerto por debajo,
        // que es justo lo que ese hueco es.
        'border-t border-sidebar-border shadow-[var(--sombra-pegada-arriba)]',
      )}
    >
      <div className="flex flex-1">
        <HuecoDeSeccion seccion={DASHBOARD} />
        <HuecoDeBoton
          Icono={Search}
          etiqueta="Buscar"
          encendido={busquedaAbierta}
          onClick={onBuscar}
        />
      </div>

      {/* Ancho fijo: es lo que mantiene el botón en el centro exacto cuando
          los grupos no tienen el mismo número de huecos. */}
      <div className="flex w-[72px] shrink-0 items-start justify-center">
        <button
          type="button"
          onClick={onNuevoGasto}
          aria-label="Registrar un gasto"
          className={cn(
            // Redondo, no baldosa con esquinas: una baldosa se leería como una
            // más de las que abre, y el único control de la barra que no es un
            // destino no debería parecer uno de ellos.
            'grid size-14 place-items-center rounded-full',
            // 16 por encima de la raya, y quedan 20 de barra por debajo.
            '-mt-4',
            // ── El color de la marca, no el acento ───────────────────────
            // El acento es la superficie de lo que RESPONDE al cursor, no la
            // de lo que llama; para llamar está el color de la marca, que es
            // además el que ya lleva el avatar cuando está encendido.
            'bg-sidebar-active text-sidebar-active-foreground shadow-[var(--sombra-flotante)]',
            // Pulsado se asienta DENTRO de la barra: el dedo ya lo está
            // tapando, así que la respuesta tiene que verse alrededor del dedo
            // y no debajo.
            'transition-transform duration-[120ms] active:translate-y-[2px]',
          )}
        >
          <Plus className="size-6" strokeWidth={2.25} aria-hidden="true" />
        </button>
      </div>

      <div className="flex flex-1">
        <HuecoDeBoton
          Icono={LayoutGrid}
          etiqueta="Atajos"
          encendido={atajosAbiertos}
          onClick={onAtajos}
        />

        <button
          type="button"
          onClick={onCuenta}
          aria-label="Mi cuenta"
          aria-expanded={cuentaAbierta}
          className="flex h-[60px] min-w-0 flex-1 items-center justify-center"
        >
          {/* Apagado va de la superficie tenue de la barra y encendido del
              color de la marca con su tinta. Nunca al revés: cuando el avatar
              llevaba el color de la barra, el círculo desaparecía y quedaban
              unas iniciales sueltas que se leían como el hueco activo. */}
          <Avatar
            nombre={nombre}
            className={cn(
              'size-8',
              cuentaAbierta
                ? 'bg-sidebar-active text-sidebar-active-foreground'
                : 'bg-sidebar-hover text-sidebar-foreground',
            )}
          />
        </button>
      </div>
    </nav>
  );
}

/** Lo que comparten los cinco huecos: la medida y el reparto del ancho. */
const HUECO =
  'flex h-[60px] min-w-0 flex-1 items-center justify-center transition-colors duration-[120ms]';

function HuecoDeSeccion({
  seccion: { to, label, Icono, exact },
}: {
  seccion: {
    to: string;
    label: string;
    Icono: ComponentType<{
      className?: string;
      'aria-hidden'?: boolean;
      fill?: string;
      fillOpacity?: number;
      strokeWidth?: number;
    }>;
    exact: boolean;
  };
}) {
  return (
    <NavLink
      to={to}
      end={exact}
      aria-label={label}
      className={({ isActive }) =>
        cn(HUECO, isActive ? 'text-sidebar-active' : 'text-sidebar-muted')
      }
    >
      <Icono
        className="size-6"
        fill="currentColor"
        fillOpacity={0.18}
        strokeWidth={1.75}
        aria-hidden={true}
      />
    </NavLink>
  );
}

/**
 * Un hueco que no lleva a ninguna parte: abre algo sobre la página.
 *
 * Se dibuja EXACTAMENTE igual que uno que sí lleva —el mismo alto, el mismo
 * reparto del ancho, el mismo par de colores—, y es a propósito: quien mira la
 * barra no tiene por qué saber cuál de los cinco cambia de pantalla y cuál
 * levanta una hoja. Lo que los distingue es lo que pasa al tocarlos.
 */
function HuecoDeBoton({
  Icono,
  etiqueta,
  encendido,
  onClick,
}: {
  Icono: ComponentType<{
    className?: string;
    'aria-hidden'?: boolean;
    fill?: string;
    fillOpacity?: number;
    strokeWidth?: number;
  }>;
  etiqueta: string;
  encendido: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={etiqueta}
      aria-expanded={encendido}
      className={cn(HUECO, encendido ? 'text-sidebar-active' : 'text-sidebar-muted')}
    >
      <Icono
        className="size-6"
        fill="currentColor"
        fillOpacity={0.18}
        strokeWidth={1.75}
        aria-hidden={true}
      />
    </button>
  );
}
