import { Menu as IconoDeMenu, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';

import { useEsMovil } from '@/app/movil';
import { useSuperficieDeAtajos } from '@/components/atajos';
import { BarraInferior } from '@/components/barra-inferior';
import { Logo, LogoCompacto } from '@/components/logo';
import { EnlaceDeSeccion, MenuDeLaCuenta, useSecciones } from '@/components/navegacion';
import { PanelDeSecciones } from '@/components/panel-de-secciones';
import { PanelInferior } from '@/components/panel-inferior';
import { PilaDeAvisos } from '@/components/ui/aviso';
import { useAuth } from '@/lib/auth-context';
import { cn } from '@/lib/utils';

/**
 * El armazón.
 *
 * ── Qué cambia en el corte ──────────────────────────────────────────────────
 * Cuatro cosas, y solo cuatro:
 *
 *   1. la navegación SE SALE del flujo — no hay ancho que darle, así que pasa
 *      a ser un panel a pantalla completa y la columna de contenido se queda
 *      la ventana entera;
 *   2. aparece un techo, y se queda pegado arriba al desplazar;
 *   3. el cuerpo se reserva al pie el hueco de la barra;
 *   4. aparece la barra de abajo.
 *
 * ── Lo que el armazón NO hace ───────────────────────────────────────────────
 * Dar estilo a sus hijos. El panel, el techo y la barra son componentes con
 * sus propias reglas; el armazón dice DÓNDE van y quién se aparta cuando otro
 * se abre. Eso último está en `index.css`, derivado con `:has()` del estado de
 * la propia superficie, porque un bloqueo que dependa de una clase que ponga
 * un script se queda puesto el día que un cierre se olvide de quitarla.
 */
export function AppShell() {
  const esMovil = useEsMovil();
  const { usuario } = useAuth();
  const { diaADia, administracion, biblioteca } = useSecciones();
  const ubicacion = useLocation();

  /**
   * La barra plegada.
   *
   * Se recuerda en `localStorage` y no en la URL ni en el servidor: es una
   * preferencia de ESTA pantalla, de este momento. Pegarle un enlace a alguien
   * no debería plegarle la barra, y cambiarla no tiene por qué viajar a la red.
   */
  const [plegada, setPlegada] = useState(
    () => localStorage.getItem('sidenav-plegada') === 'si',
  );

  const [menuAbierto, setMenuAbierto] = useState(false);
  const [atajosAbiertos, setAtajosAbiertos] = useState(false);

  // Cambiar de página cierra lo que esté tapándola. Un panel que sobrevive a
  // su propio enlace deja a la persona mirando el menú de una pantalla que ya
  // no está debajo.
  useEffect(() => {
    setMenuAbierto(false);
    setAtajosAbiertos(false);
  }, [ubicacion.pathname]);

  function alternarBarra(): void {
    setPlegada((antes) => {
      localStorage.setItem('sidenav-plegada', antes ? 'no' : 'si');
      return !antes;
    });
  }

  const { cabeza, cuerpo } = useSuperficieDeAtajos({
    abierto: atajosAbiertos,
    biblioteca: biblioteca.map(({ to, label, Icono }) => ({ ruta: to, etiqueta: label, Icono })),
    // Lo de fábrica es lo del día a día. Lo de administración se configura una
    // vez y casi no se toca: está en el menú, y se añade desde ahí quien lo use.
    porDefecto: diaADia.map((s) => s.to),
    onIr: () => setAtajosAbiertos(false),
  });

  // El botón del centro queda centrado aunque los grupos no empaten: el hueco
  // del medio tiene ancho fijo y los dos lados son mitades iguales.
  const corte = Math.ceil(diaADia.length / 2);

  return (
    <div className="min-h-dvh bg-background">
      {/* ── Riel — escritorio ────────────────────────────────────────────────
          13rem y no 16: el enlace más largo, "Centros de costos", mide unos
          120px a 14px, y con el icono y los márgenes cabe de sobra. Lo que
          sobraba de ancho se lo estaba quitando al contenido.

          Se MONTA o no se monta, no se esconde con CSS: un riel escondido
          sigue siendo nueve enlaces en el orden de tabulación de un teléfono,
          y sus nombres siguen estando dos veces en la página. */}
      {!esMovil && (
        <aside
          className={cn(
            'fixed inset-y-0 left-0 flex flex-col bg-sidebar p-3 transition-[width]',
            plegada ? 'w-16' : 'w-52',
          )}
        >
          <div
            className={cn(
              'mb-8 flex items-center pt-3',
              // Plegada, la marca se centra porque no hay nada más en la fila;
              // desplegada va a la izquierda y el botón de plegar al otro
              // extremo, que es donde uno lo busca.
              plegada ? 'justify-center px-0' : 'justify-between px-2',
            )}
          >
            {plegada ? (
              <LogoCompacto className="size-7 text-sidebar-active" />
            ) : (
              <>
                {/* Se le da ALTO: el logotipo es 3.82:1 y fijarle el ancho lo
                    dejaría demasiado bajo para leerse. Lima sobre la barra
                    oscura: 10.1:1 de contraste, y es el acento de la marca. */}
                <Logo className="h-7 w-auto text-sidebar-active" />
                <button
                  type="button"
                  onClick={alternarBarra}
                  aria-label="Plegar la barra lateral"
                  title="Plegar la barra lateral"
                  className="grid size-8 shrink-0 place-items-center rounded-lg text-sidebar-muted transition-colors hover:bg-sidebar-hover hover:text-sidebar-foreground"
                >
                  <PanelLeftClose className="size-[18px]" aria-hidden="true" />
                </button>
              </>
            )}
          </div>

          {plegada && (
            <button
              type="button"
              onClick={alternarBarra}
              aria-label="Desplegar la barra lateral"
              title="Desplegar la barra lateral"
              className="mb-2 grid h-9 w-full place-items-center rounded-lg text-sidebar-muted transition-colors hover:bg-sidebar-hover hover:text-sidebar-foreground"
            >
              <PanelLeftOpen className="size-[18px]" aria-hidden="true" />
            </button>
          )}

          <nav className="flex flex-1 flex-col gap-1" aria-label="Secciones">
            {diaADia.map(({ to, label, Icono, exact }) => (
              <EnlaceDeSeccion key={to} to={to} exact={exact} plegada={plegada} titulo={label}>
                <Icono className="size-[18px] shrink-0" fill="currentColor" fillOpacity={0.18} strokeWidth={1.75} aria-hidden={true} />
                {!plegada && label}
              </EnlaceDeSeccion>
            ))}

            {administracion.length > 0 && (
              <>
                {/* Plegada, el rótulo no cabe: se queda la raya, que es lo que
                    de verdad hace falta —decir que lo de abajo es otra cosa—. */}
                {plegada ? (
                  <hr className="my-3 border-sidebar-border" />
                ) : (
                  <p className="mt-6 mb-1 px-3 text-[11px] font-semibold uppercase tracking-wider text-sidebar-muted">
                    Administración
                  </p>
                )}
                {administracion.map(({ to, label, Icono, exact }) => (
                  <EnlaceDeSeccion key={to} to={to} exact={exact} plegada={plegada} titulo={label}>
                    <Icono className="size-[18px] shrink-0" fill="currentColor" fillOpacity={0.18} strokeWidth={1.75} aria-hidden={true} />
                    {!plegada && label}
                  </EnlaceDeSeccion>
                ))}
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
      )}

      {/* ── Techo — teléfono ─────────────────────────────────────────────────
          Pegado arriba, que es el momento en el que hace falta que se entienda
          qué capa va encima: por eso la sombra va en el elemento PEGADO y no
          en uno cualquiera. */}
      {esMovil && (
        <header
          data-armazon="techo"
          className="sticky top-0 z-20 flex h-16 items-center justify-between gap-2 bg-sidebar px-4 shadow-[var(--sombra-pegada)]"
        >
          <Logo className="h-7 w-auto text-sidebar-active" />
          <button
            type="button"
            onClick={() => setMenuAbierto(true)}
            aria-label="Abrir el menú"
            aria-expanded={menuAbierto}
            className="grid size-11 place-items-center rounded-lg text-sidebar-muted transition-colors hover:bg-sidebar-hover hover:text-sidebar-foreground"
          >
            <IconoDeMenu className="size-6" aria-hidden="true" />
          </button>
        </header>
      )}

      {/* Contenido */}
      <div className={cn('transition-[padding]', plegada ? 'escritorio:pl-16' : 'escritorio:pl-52')}>
        <main
          className={cn(
            'w-full px-4 pt-5 escritorio:px-8 escritorio:pb-16 escritorio:pt-10 lg:px-10',
            // ── Recorta, no ofrece ──────────────────────────────────────────
            // `auto` no contiene un desbordamiento: lo OFRECE como barra de
            // desplazamiento. Y como la página entera vive aquí dentro, el
            // efecto es indistinguible de desplazar el documento: el título se
            // va hacia la izquierda y el armazón queda descuadrado.
            //
            // Peor: cuando un documento se desborda de lado, la ventana de
            // maquetado del teléfono CRECE, y con ella todo lo que está fijo.
            // Una tabla ancha no se recortaba: estiraba la barra de abajo a
            // 659px dentro de una pantalla de 400 y echaba dos de sus huecos
            // fuera del borde.
            //
            // `clip` se niega en vez de ofrecer. Solo en la X, porque la página
            // tiene que seguir desplazándose en vertical. La consecuencia es la
            // buscada: lo que de verdad sea más ancho se CORTA. Una pantalla de
            // teléfono no se desplaza de lado; lo que tenga contenido ancho se
            // trae su propio desplazamiento.
            'movil:overflow-x-clip movil:pb-[var(--hueco-de-la-barra)]',
          )}
        >
          <Outlet />
        </main>
      </div>

      {esMovil && (
        <>
          <BarraInferior
            izquierda={diaADia.slice(0, corte)}
            derecha={diaADia.slice(corte)}
            nombre={usuario?.display_name ?? usuario?.email ?? '?'}
            onAtajos={() => setAtajosAbiertos(true)}
          />

          <PanelDeSecciones
            abierta={menuAbierto}
            diaADia={diaADia}
            administracion={administracion}
            onCerrar={() => setMenuAbierto(false)}
          />

          {/* Montado siempre, abierto o cerrado: lo que se desliza no se puede
              reconstruir en cada render, o aparece en vez de llegar. */}
          <PanelInferior
            abierto={atajosAbiertos}
            titulo="Atajos"
            cabeza={cabeza}
            onCerrar={() => setAtajosAbiertos(false)}
          >
            {cuerpo}
          </PanelInferior>
        </>
      )}

      <PilaDeAvisos />
    </div>
  );
}
