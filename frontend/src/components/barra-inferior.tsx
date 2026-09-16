import { LayoutGrid } from 'lucide-react';
import { NavLink } from 'react-router-dom';

import { Avatar, type Seccion } from '@/components/navegacion';
import { cn } from '@/lib/utils';

/**
 * La barra de abajo. La forma de llegar a lo del día a día con una mano.
 *
 * ── Cinco huecos, y cinco es un TECHO, no un objetivo ───────────────────────
 * Material limita una barra de navegación a cinco destinos y Apple limita una
 * de pestañas a cinco, los dos por lo mismo: el sexto deja todos los blancos
 * demasiado estrechos. A 375 de ancho, cinco huecos son 75×60.
 *
 * Aquí son cuatro o cinco según si se llevan cuentas, y el botón del centro
 * queda centrado igual: los dos grupos son mitades iguales y el centro es un
 * hueco fijo entre ellas, así que no depende de cuántos enlaces caigan a cada
 * lado.
 *
 * ── Solo iconos ─────────────────────────────────────────────────────────────
 * Cinco palabras de 12px bajo cinco dibujos son una segunda fila de texto
 * compitiendo con la página, y aplanarían la única jerarquía que la barra
 * tiene. Cada hueco lleva su nombre accesible.
 *
 * ── Lo que NO está aquí ─────────────────────────────────────────────────────
 * El menú. Su botón está arriba, en el techo, que es el borde por el que entra
 * el panel; y cuando el panel se abre, esta barra se retira. Las secciones son
 * a dónde se VA; esto es lo que se hace con la página en la que se está.
 */
export function BarraInferior({
  izquierda,
  derecha,
  nombre,
  onAtajos,
}: {
  izquierda: readonly Seccion[];
  derecha: readonly Seccion[];
  nombre: string;
  onAtajos: () => void;
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
        {izquierda.map((seccion) => (
          <Hueco key={seccion.to} seccion={seccion} />
        ))}
      </div>

      {/* Ancho fijo: es lo que mantiene el botón en el centro exacto cuando
          los grupos no tienen el mismo número de enlaces. */}
      <div className="flex w-[72px] shrink-0 items-start justify-center">
        <button
          type="button"
          onClick={onAtajos}
          aria-label="Atajos"
          className={cn(
            // Redondo, no baldosa con esquinas: una baldosa se leería como una
            // más de las que abre, y el único control de la barra que no es un
            // destino no debería parecer uno de ellos.
            'grid size-14 place-items-center rounded-full',
            // 16 por encima de la raya, y quedan 20 de barra por debajo.
            '-mt-4',
            // ── El color de la marca, no el acento ───────────────────────
            // Era `--accent`, que en claro es un verde AGUA muy pálido
            // (#e0ebe9) sobre una barra de #f1efe8: el control más importante
            // del teléfono quedaba pálido sobre pálido y había que buscarlo.
            // El acento es la superficie de lo que RESPONDE al cursor, no la
            // de lo que llama; para llamar está el color de la marca, que es
            // además el que ya lleva el avatar cuando está encendido.
            //
            // El comentario de antes decía «lima con tinta, nunca blanco»:
            // desde el cambio de tema no hay lima, y la tinta correcta la
            // declara el propio par de tokens.
            'bg-sidebar-active text-sidebar-active-foreground shadow-[var(--sombra-flotante)]',
            // Pulsado se asienta DENTRO de la barra: el dedo ya lo está
            // tapando, así que la respuesta tiene que verse alrededor del dedo
            // y no debajo.
            'transition-transform duration-[120ms] active:translate-y-[2px]',
          )}
        >
          <LayoutGrid className="size-6" aria-hidden="true" />
        </button>
      </div>

      <div className="flex flex-1">
        {derecha.map((seccion) => (
          <Hueco key={seccion.to} seccion={seccion} />
        ))}
        <NavLink
          to="/mi-cuenta"
          className={({ isActive }) =>
            cn(
              'flex h-[60px] min-w-0 flex-1 items-center justify-center transition-colors duration-[120ms]',
              isActive && 'text-sidebar-active',
            )
          }
          aria-label="Mi cuenta"
        >
          {({ isActive }) => (
            // Apagado va de la superficie tenue de la barra y encendido del
            // color de la marca con su tinta. Nunca al revés: cuando el avatar
            // llevaba el color de la barra, el círculo desaparecía y quedaban
            // unas iniciales sueltas que se leían como el hueco activo.
            <Avatar
              nombre={nombre}
              className={cn(
                'size-8',
                isActive
                  ? 'bg-sidebar-active text-sidebar-active-foreground'
                  : 'bg-sidebar-hover text-sidebar-foreground',
              )}
            />
          )}
        </NavLink>
      </div>
    </nav>
  );
}

function Hueco({ seccion: { to, label, Icono, exact } }: { seccion: Seccion }) {
  return (
    <NavLink
      to={to}
      end={exact}
      aria-label={label}
      className={({ isActive }) =>
        cn(
          'flex h-[60px] min-w-0 flex-1 items-center justify-center transition-colors duration-[120ms]',
          isActive ? 'text-sidebar-active' : 'text-sidebar-muted',
        )
      }
    >
      <Icono className="size-6" fill="currentColor" fillOpacity={0.18} strokeWidth={1.75} aria-hidden={true} />
    </NavLink>
  );
}
