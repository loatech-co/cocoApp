import { PanelLeftClose, PanelLeftOpen } from 'lucide-react';

import type { Seccion } from '@/shared/lib/sections';
import { cn } from '@/shared/lib/utils';
import { Logo, LogoCompacto } from '@/shared/ui/atoms/logo';

import { EnlaceDeSeccion, MenuDeLaCuenta, useSecciones } from './navegacion';

/**
 * El riel del escritorio.
 *
 * 14rem. Eran 13, y se quedaba estrecho: "Centros de costos" llegaba casi a
 * tocar el borde del pozo, y el riel se leía como una columna apretada al lado
 * del contenido en vez de como el marco que lo envuelve. El riel no lleva fondo
 * propio —es la página— y lo que lo delimita es el canto del pozo.
 */
export function SideRail({ plegada, onAlternar }: { plegada: boolean; onAlternar: () => void }) {
  const { diaADia, administracion } = useSecciones();

  return (
    <aside
      className={cn(
        'fixed inset-y-0 left-0 flex flex-col p-3 transition-[width]',
        plegada ? 'w-16' : 'w-56',
      )}
    >
      <RailHeader plegada={plegada} onAlternar={onAlternar} />

      {plegada && (
        <button
          type="button"
          onClick={onAlternar}
          aria-label="Desplegar la barra lateral"
          title="Desplegar la barra lateral"
          className="mb-2 grid h-9 w-full place-items-center rounded-lg text-sidebar-muted transition-colors hover:text-sidebar-foreground"
        >
          <PanelLeftOpen className="size-[18px]" aria-hidden="true" />
        </button>
      )}

      <nav className="flex flex-1 flex-col gap-1" aria-label="Secciones">
        <SectionLinks secciones={diaADia} plegada={plegada} />

        {administracion.length > 0 && (
          <>
            {/* Plegada, el rótulo no cabe: se queda la raya, que es lo que
                de verdad hace falta —decir que lo de abajo es otra cosa—. */}
            {plegada ? (
              <hr className="my-3 border-sidebar-border" />
            ) : (
              <p className="mt-6 mb-1 px-3 text-xs font-semibold text-sidebar-muted">
                Administración
              </p>
            )}
            <SectionLinks secciones={administracion} plegada={plegada} />
          </>
        )}
      </nav>

      {/* Al pie, no en una cabecera aparte: una franja del ancho entero de
          la pantalla solo para decir con qué cuenta se está dentro es mucha
          franja. Aquí abajo ocupa un sitio que ya estaba vacío. */}
      <div className="mt-4 border-t border-sidebar-border pt-3">
        <MenuDeLaCuenta plegada={plegada} />
      </div>
    </aside>
  );
}

function RailHeader({ plegada, onAlternar }: { plegada: boolean; onAlternar: () => void }) {
  return (
    <div
      className={cn(
        'mb-8 flex items-center pt-3',
        // Plegada, la marca se centra porque no hay nada más en la fila;
        // desplegada va a la izquierda y el botón de plegar al otro
        // extremo, que es donde uno lo busca.
        // Y la fila no lleva relleno por la DERECHA: el botón de plegar
        // se alinea solo, con su propio margen negativo. Ver abajo.
        plegada ? 'justify-center px-0' : 'justify-between pl-2 pr-0',
      )}
    >
      {plegada ? (
        <LogoCompacto className="size-7 text-sidebar-active" />
      ) : (
        <>
          {/* Se le da ALTO: el logotipo es 3.82:1 y fijarle el ancho lo
              dejaría demasiado bajo para leerse. Va en `sidebar-active`,
              que es el color con el que cada tema dice "aquí": verde
              británico sobre el riel claro, lima sobre el oscuro. */}
          <Logo className="h-7 w-auto text-sidebar-active" />
          <button
            type="button"
            onClick={onAlternar}
            aria-label="Plegar la barra lateral"
            title="Plegar la barra lateral"
            /*
              Lo que se alinea es el ICONO, no su área de toque.

              El botón mide 36 y el icono 18, así que lleva 9 de aire a
              cada lado. Con el botón a ras del riel, el icono quedaba
              9px por dentro del canto de las filas de navegación —que
              ocupan todo el ancho del riel— y se leía como si estuviera
              descolgado hacia la izquierda.

              El margen negativo es exactamente ese aire: saca el área
              de toque 9px, que es lo que hace falta para que el canto
              derecho del icono caiga sobre el canto derecho de las
              filas. El área de toque sigue midiendo 36.
            */
            className="-mr-[9px] grid size-9 shrink-0 place-items-center rounded-lg text-sidebar-muted transition-colors hover:text-sidebar-foreground"
          >
            <PanelLeftClose className="size-[18px]" aria-hidden="true" />
          </button>
        </>
      )}
    </div>
  );
}

function SectionLinks({ secciones, plegada }: { secciones: readonly Seccion[]; plegada: boolean }) {
  return secciones.map(({ to, label, Icono, exact }) => (
    <EnlaceDeSeccion key={to} to={to} exact={exact} plegada={plegada} titulo={label}>
      <Icono
        className="size-[18px] shrink-0"
        fill="currentColor"
        fillOpacity={0.18}
        strokeWidth={1.75}
        aria-hidden={true}
      />
      {!plegada && label}
    </EnlaceDeSeccion>
  ));
}
