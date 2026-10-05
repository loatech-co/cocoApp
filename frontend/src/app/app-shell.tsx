import { Eye, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';

import { useEnLaApp, useEsMovil } from '@/app/movil';
import { useSuperficieDeAtajos } from '@/components/atajos';
import { BarraInferior } from '@/components/barra-inferior';
import { Logo, LogoCompacto } from '@/components/logo';
import { EnlaceDeSeccion, MenuDeLaCuenta, useSecciones } from '@/components/navegacion';
import { PanelDeBusqueda } from '@/components/panel-de-busqueda';
import { PanelDeLaCuenta } from '@/components/panel-de-la-cuenta';
import { PanelInferior } from '@/components/panel-inferior';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { PilaDeAvisos } from '@/components/ui/aviso';
import { Button } from '@/components/ui/button';
import { MovimientoModal } from '@/features/transactions/movimiento-modal';
import { useAlCambiar } from '@/lib/al-cambiar';
import { useAuth } from '@/lib/auth-context';
import { registrarPuente } from '@/lib/puente-nativo';
import { cn } from '@/lib/utils';
import type { Transaction } from '@coco/types';

/**
 * El armazón.
 *
 * ── Qué cambia en el corte ──────────────────────────────────────────────────
 * Cuatro cosas, y solo cuatro:
 *
 *   1. el riel DESAPARECE — no hay ancho que darle, y lo que hacía se reparte
 *      entre la barra de abajo, los atajos y la hoja de la cuenta;
 *   2. aparece un techo con la marca, y se queda pegado arriba al desplazar;
 *   3. el cuerpo se reserva al pie el hueco de la barra;
 *   4. aparece la barra de abajo, con sus tres hojas y la ficha del (+).
 *
 * ── Por qué ya no hay menú de hamburguesa ───────────────────────────────────
 * Porque era un tercer sitio donde vivía la misma lista. El riel la tiene en
 * el escritorio; en el teléfono la barra de abajo lleva lo del día a día, los
 * atajos llevan CUALQUIER página —y se arman a mano, que es mejor que un orden
 * que decidimos nosotros— y la hoja del avatar lleva lo de administrar. Un
 * panel a pantalla completa con las nueve secciones era la cuarta forma de
 * llegar a las mismas páginas, y la que menos se usaba.
 *
 * ── Lo que el armazón NO hace ───────────────────────────────────────────────
 * Dar estilo a sus hijos. El panel, el techo y la barra son componentes con
 * sus propias reglas; el armazón dice DÓNDE van y quién se aparta cuando otro
 * se abre. Eso último está en `index.css`, derivado con `:has()` del estado de
 * la propia superficie, porque un bloqueo que dependa de una clase que ponga
 * un script se queda puesto el día que un cierre se olvide de quitarla.
 */
/**
 * El recordatorio de que se está mirando como un usuario normal.
 *
 * ── Por qué hace falta un cartel ────────────────────────────────────────────
 * Porque el modo QUITA cosas de la pantalla —el grupo de Administración, la
 * insignia de Mi cuenta, las dos páginas del panel— y lo que falta no se ve.
 * Sin esto, un administrador que lo encendiera y volviera media hora después
 * se encontraría la aplicación sin panel y ninguna pista de por qué: la
 * conclusión natural es que algo se rompió, no que uno mismo lo apagó.
 *
 * Por eso lleva la salida DENTRO, y no solo en el menú del avatar: quien no
 * recuerda haberlo encendido tampoco va a ir a buscar dónde se apaga.
 *
 * ── Y por qué no es rojo ────────────────────────────────────────────────────
 * Porque no falló nada. Es un estado deliberado y reversible, que es
 * exactamente lo que dice el tono de aviso del tema.
 */
function VistaDeUsuario() {
  const { viendoComoUsuario, verComoUsuario } = useAuth();

  if (!viendoComoUsuario) return null;

  return (
    <Alert variant="warning" className="mb-4 items-center">
      <Eye aria-hidden="true" />
      <AlertDescription className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <span>
          Estás viendo Coco como la ve una cuenta sin administración. Tus datos son los mismos.
        </span>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="shrink-0"
          onClick={() => verComoUsuario(false)}
        >
          Volver a administrador
        </Button>
      </AlertDescription>
    </Alert>
  );
}

/**
 * Lo que la app del teléfono puede pedirle a la web: ir a una ruta y abrir la
 * búsqueda.
 *
 * ── Por qué es un componente hijo del armazón y no del enrutador ────────────
 * Hay UNA sola llamada a `registrarPuente`, porque `window.__coco` es un solo
 * objeto y dos registros se pisarían. Y las dos cosas que publica nacen en
 * sitios distintos: `navigate` es del enrutador, y abrir la búsqueda es el
 * estado del armazón. El armazón es el elemento de `/` y vive dentro del
 * enrutador, así que desde aquí se llega a las dos; desde `router.tsx` no se
 * llega al estado de la búsqueda sin sacarlo del armazón.
 *
 * Lo que se pierde es poder navegar ANTES de que haya sesión —el armazón no
 * se monta sin ella—, y no hace falta: sin sesión no hay página que pintar,
 * y la app, si no encuentra `__coco`, carga la ruta por URL, que es lo mismo.
 *
 * Fuera de la app no instala nada: `registrarPuente` lo pregunta.
 */
function PuenteDeNavegacion({ abrirBusqueda }: { abrirBusqueda: () => void }) {
  const navigate = useNavigate();

  useEffect(
    () => registrarPuente({ ir: (ruta) => void navigate(ruta), abrirBusqueda }),
    [navigate, abrirBusqueda],
  );

  return null;
}

export function AppShell() {
  const esMovil = useEsMovil();
  /**
   * Dentro de la app del teléfono.
   *
   * La barra nativa y la pestaña «Más» hacen lo que aquí hacen el techo, la
   * barra de abajo, la hoja de atajos y la de la cuenta, así que NO se
   * montan: no se esconden con CSS, que dejaría nueve enlaces en el orden de
   * tabulación y una barra fija debajo de otra. La búsqueda y la ficha sí,
   * porque la pestaña nativa «Buscar» abre la de aquí.
   */
  const embebida = useEnLaApp();
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
  const [plegada, setPlegada] = useState(() => localStorage.getItem('sidenav-plegada') === 'si');

  const [atajosAbiertos, setAtajosAbiertos] = useState(false);
  const [busquedaAbierta, setBusquedaAbierta] = useState(false);
  const [cuentaAbierta, setCuentaAbierta] = useState(false);

  /**
   * La ficha que el armazón tiene abierta.
   *
   * `undefined` es cerrada, `null` es una nueva y un movimiento es ese. Es la
   * misma convención que usa el resumen, y a propósito: abrir un gasto desde
   * el (+) de la barra o desde un resultado de la búsqueda no puede ser otra
   * ficha ni otro formulario que abrirlo desde la tabla.
   */
  const [ficha, setFicha] = useState<Transaction | null | undefined>(undefined);

  // Cambiar de página cierra lo que esté tapándola. Una hoja que sobrevive a
  // su propio enlace deja a la persona mirando los atajos de una pantalla que
  // ya no está debajo.
  useAlCambiar([ubicacion.pathname], () => {
    setAtajosAbiertos(false);
    setBusquedaAbierta(false);
    setCuentaAbierta(false);
  });

  // Estable entre renders: es lo que el puente publica, y un `useEffect` que
  // dependa de ella no tiene por qué volver a registrarse en cada pintado.
  const [abrirBusqueda] = useState(() => () => setBusquedaAbierta(true));

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

  return (
    // La página entera es EL MATERIAL —el mismo color de la tarjeta y del
    // riel— y el contenido se abre dentro como un pozo. El armazón entero
    // está explicado en el `<main>` de más abajo.
    <div className="flex min-h-dvh flex-col bg-sidebar">
      {/* ── Riel — escritorio ────────────────────────────────────────────────
          14rem. Eran 13, y se quedaba estrecho: "Centros de costos" llegaba
          casi a tocar el borde del pozo, y el riel se leía como una columna
          apretada al lado del contenido en vez de como el marco que lo
          envuelve. El riel no lleva fondo propio —es la página— y lo que lo
          delimita es el canto del pozo.

          Se MONTA o no se monta, no se esconde con CSS: un riel escondido
          sigue siendo nueve enlaces en el orden de tabulación de un teléfono,
          y sus nombres siguen estando dos veces en la página. */}
      {!esMovil && !embebida && (
        <aside
          className={cn(
            'fixed inset-y-0 left-0 flex flex-col p-3 transition-[width]',
            plegada ? 'w-16' : 'w-56',
          )}
        >
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
                  onClick={alternarBarra}
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

          {plegada && (
            <button
              type="button"
              onClick={alternarBarra}
              aria-label="Desplegar la barra lateral"
              title="Desplegar la barra lateral"
              className="mb-2 grid h-9 w-full place-items-center rounded-lg text-sidebar-muted transition-colors hover:text-sidebar-foreground"
            >
              <PanelLeftOpen className="size-[18px]" aria-hidden="true" />
            </button>
          )}

          <nav className="flex flex-1 flex-col gap-1" aria-label="Secciones">
            {diaADia.map(({ to, label, Icono, exact }) => (
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
            ))}

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
                {administracion.map(({ to, label, Icono, exact }) => (
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
      {esMovil && !embebida && (
        <header
          data-armazon="techo"
          // La marca SOLA, y centrada. Antes compartía la fila con el botón del
          // menú, que ya no existe: con un único elemento, dejarlo pegado a la
          // izquierda deja media franja vacía a su derecha y el techo se lee
          // como una fila a la que le falta algo. Centrado es una portada.
          className="sticky top-0 z-20 flex h-16 items-center justify-center bg-sidebar px-4 shadow-[var(--sombra-pegada)]"
        >
          <Logo className="h-7 w-auto text-sidebar-active" />
        </header>
      )}

      {/* ── EL HUECO DONDE SE ABRE EL POZO ──────────────────────────────────
          En escritorio esta caja mide EXACTAMENTE la ventana y no se
          desplaza: lo que se desplaza es el pozo, por dentro. Es lo que hace
          posible que el pozo tenga cuatro cantos a la vista, porque si la
          página entera se desplazara, el de arriba se iría en cuanto alguien
          bajara una pantalla.

          Los 20px de arriba, de la derecha y de abajo son el material que
          rodea al pozo. Por la izquierda no se escriben: ahí el hueco no lo
          hace un margen sino el riel, que mide 14rem con 3 de relleno propio,
          así que entre lo último que escribe y el canto del pozo quedan 12.

          Que no midan lo mismo es correcto y no un descuido: a los otros tres
          lados el hueco es la distancia al BORDE DE LA VENTANA, y a la
          izquierda es la distancia a lo que hay escrito en el riel. Son dos
          relaciones distintas y no tienen por qué empatar. */}
      <div
        className={cn(
          'flex flex-1 flex-col transition-[padding]',
          'escritorio:h-dvh escritorio:py-5 escritorio:pr-5',
          // Sin riel —una tableta dentro de la app— el hueco de la izquierda
          // es el mismo que el de los otros tres lados.
          embebida ? 'escritorio:pl-5' : plegada ? 'escritorio:pl-16' : 'escritorio:pl-56',
        )}
      >
        <main
          className={cn(
            // El relleno de arriba es MENOR que el de los lados, y no es un
            // descuido. Eran 40px, los mismos que el lateral en pantalla
            // ancha, y se decidieron cuando el contenido se apoyaba
            // directamente sobre la página: entonces ese hueco era lo único
            // que separaba el título del borde de la ventana. Ahora, por
            // encima, hay 20px de material y el canto del pozo, que ya hacen
            // ese trabajo; los 40 de dentro se sumaban a ellos y dejaban el
            // título flotando en 60px de nada.
            'w-full flex-1 px-4 pt-5 escritorio:px-8 escritorio:pb-16 escritorio:pt-6 lg:px-10',
            // ── EL POZO ─────────────────────────────────────────────────────
            // El contenido no se apoya sobre la página: se abre DENTRO de
            // ella. La página es el material —el mismo color de la tarjeta y
            // del riel— y esto es el hueco, un tono por debajo.
            //
            // De ahí salen dos cosas que no se pueden separar. Una, el riel
            // deja de ser una columna pegada al lado y pasa a leerse como el
            // marco que envuelve al contenido, porque es el mismo material y
            // lo rodea por los cuatro lados. Y dos, la tarjeta —que es
            // material otra vez— se separa del fondo sola, sin borde.
            //
            // El canto redondeado es lo que cuenta el truco. Con el pozo
            // pegado a los bordes de la ventana, el cambio de color es una
            // raya vertical y se lee como dos columnas; separado y con las
            // esquinas curvas, se lee como una pieza metida dentro de otra.
            // Por eso el margen y el radio son la misma decisión y no dos.
            //
            // 14px, y es la única excepción al radio estándar de la app: es
            // el contenedor más grande que hay, y 10 en un canto que mide
            // toda la ventana casi no se ve. Está registrada, con su motivo,
            // en `components/ui/radio.test.ts`.
            'bg-background escritorio:rounded-xl',
            // El pozo es el que se desplaza, no la página. `min-h-0` es lo
            // que se lo permite: sin él, un hijo de una columna flexible mide
            // lo que mide su contenido y estira la caja de fuera, que es
            // justo la que no puede crecer.
            'escritorio:min-h-0 escritorio:overflow-y-auto',
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
          <VistaDeUsuario />
          <Outlet />
        </main>
      </div>

      {esMovil && !embebida && (
        <>
          <BarraInferior
            nombre={usuario?.display_name ?? usuario?.email ?? '?'}
            busquedaAbierta={busquedaAbierta}
            onBuscar={() => setBusquedaAbierta(true)}
            // Directo al gasto, sin menú de por medio: es la única opción viva
            // de las dos que ofrece el menú de la pantalla ancha.
            onNuevoGasto={() => setFicha(null)}
            atajosAbiertos={atajosAbiertos}
            onAtajos={() => setAtajosAbiertos(true)}
            cuentaAbierta={cuentaAbierta}
            onCuenta={() => setCuentaAbierta(true)}
          />

          {/* Las tres hojas van montadas siempre, abiertas o cerradas: lo que
              se desliza no se puede reconstruir en cada render, o aparece en
              vez de llegar. */}
          <PanelInferior
            abierto={atajosAbiertos}
            titulo="Atajos"
            cabeza={cabeza}
            onCerrar={() => setAtajosAbiertos(false)}
          >
            {cuerpo}
          </PanelInferior>

          <PanelDeLaCuenta abierto={cuentaAbierta} onCerrar={() => setCuentaAbierta(false)} />
        </>
      )}

      {/* La búsqueda y la ficha, en el teléfono Y dentro de la app: allí las
          abre la barra nativa a través de `PuenteDeNavegacion`. */}
      {(esMovil || embebida) && (
        <>
          <PanelDeBusqueda
            abierto={busquedaAbierta}
            onCerrar={() => setBusquedaAbierta(false)}
            // Encontrado el movimiento, la búsqueda se acabó: la hoja se cierra
            // y en su sitio se abre la ficha. Dejarla debajo obligaría a
            // cerrarla después, y con la ficha encima ya no se ve.
            onElegir={(movimiento) => {
              setBusquedaAbierta(false);
              setFicha(movimiento);
            }}
          />

          {/* Esta sí se monta al abrirse. No se desliza —entra con la animación
              de su propio velo, que corre por existir—, y montada siempre
              tendría sus consultas en pie en todas las pantallas del teléfono. */}
          {ficha !== undefined && (
            <MovimientoModal
              abierta
              movimiento={ficha}
              tipoPorDefecto="expense"
              onCerrar={() => setFicha(undefined)}
            />
          )}
        </>
      )}

      {embebida && <PuenteDeNavegacion abrirBusqueda={abrirBusqueda} />}

      <PilaDeAvisos />
    </div>
  );
}
