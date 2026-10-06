import { LayoutGrid, Search } from 'lucide-react';

import { t } from '@/shared/lib/i18n';
import { DASHBOARD } from '@/shared/lib/sections';
import { cn } from '@/shared/lib/utils';
import { BarFab, BarIcon, BarSlotButton, BarSlotLink } from '@/shared/ui/atoms/bar-slot';

import { Avatar } from './navegacion';

interface BottomBarProps {
  nombre: string;
  busquedaAbierta: boolean;
  onBuscar: () => void;
  onNuevoGasto: () => void;
  atajosAbiertos: boolean;
  onAtajos: () => void;
  cuentaAbierta: boolean;
  onCuenta: () => void;
}

/** The bar itself: fixed to the bottom edge, over the page and under the top bar. */
const CLASES_DE_LA_BARRA = cn(
  'fixed inset-x-0 bottom-0 flex items-stretch',
  // Por DEBAJO del techo, que va a 20, y a propósito: un desplegable
  // anclado al techo es hijo suyo, así que ningún z-index de dentro
  // puede ganarle a un hermano del techo. Las dos barras no se solapan
  // nunca —una está arriba y otra al pie—, así que no se pierde nada.
  'z-[15]',
  'bg-sidebar pb-seguro',
  // El relleno de abajo, y no más alto: la fila de la barra mide 60
  // exactos y el borde seguro del teléfono es hueco muerto por debajo,
  // que es justo lo que ese hueco es.
  'border-t border-sidebar-border shadow-[var(--sombra-pegada-arriba)]',
);

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
}: BottomBarProps) {
  return (
    <nav
      data-armazon="barra"
      aria-label={t('shell.bottomBar.label')}
      className={CLASES_DE_LA_BARRA}
    >
      <div className="flex flex-1">
        <BarSlotLink
          to={DASHBOARD.to}
          isExact={DASHBOARD.exact}
          label={DASHBOARD.label}
          Icon={DASHBOARD.Icono}
        />
        <BarSlotButton
          label={t('shell.bottomBar.search')}
          isOn={busquedaAbierta}
          onClick={onBuscar}
        >
          <BarIcon Icon={Search} />
        </BarSlotButton>
      </div>

      {/* Ancho fijo: es lo que mantiene el botón en el centro exacto cuando
          los grupos no tienen el mismo número de huecos. */}
      <div className="flex w-18 shrink-0 items-start justify-center">
        <BarFab label={t('shell.bottomBar.newExpense')} onClick={onNuevoGasto} />
      </div>

      <div className="flex flex-1">
        <BarSlotButton label={t('shell.shortcuts.title')} isOn={atajosAbiertos} onClick={onAtajos}>
          <BarIcon Icon={LayoutGrid} />
        </BarSlotButton>

        <AccountSlot nombre={nombre} abierta={cuentaAbierta} onClick={onCuenta} />
      </div>
    </nav>
  );
}

function AccountSlot({
  nombre,
  abierta,
  onClick,
}: {
  nombre: string;
  abierta: boolean;
  onClick: () => void;
}) {
  return (
    <BarSlotButton label={t('shell.account.myAccount')} isOn={abierta} onClick={onClick}>
      {/* Apagado va de la superficie tenue de la barra y encendido del
          color de la marca con su tinta. Nunca al revés: cuando el avatar
          llevaba el color de la barra, el círculo desaparecía y quedaban
          unas iniciales sueltas que se leían como el hueco activo. */}
      <Avatar
        nombre={nombre}
        className={cn(
          'size-8',
          abierta
            ? 'bg-sidebar-active text-sidebar-active-foreground'
            : 'bg-sidebar-hover text-sidebar-foreground',
        )}
      />
    </BarSlotButton>
  );
}
