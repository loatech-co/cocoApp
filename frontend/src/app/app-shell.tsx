import { useQueryClient } from '@tanstack/react-query';
import { Eye } from 'lucide-react';
import { useEffect } from 'react';
import { Outlet, useNavigate } from 'react-router-dom';

import { MovimientoModal } from '@/features/transactions/components/movimiento-modal';
import { PanelDeBusqueda } from '@/features/transactions/components/panel-de-busqueda';
import { useAuth } from '@/shared/api/auth-context';
import { registrarPuente } from '@/shared/api/native-bridge';
import { invalidateDerived } from '@/shared/api/query-keys';
import { t } from '@/shared/lib/i18n';
import { useEnLaApp, useEsMovil } from '@/shared/lib/movil';
import { cn } from '@/shared/lib/utils';
import { Alert, AlertDescription } from '@/shared/ui/atoms/alert';
import { BottomSheet } from '@/shared/ui/atoms/bottom-sheet';
import { Button } from '@/shared/ui/atoms/button';
import { Logo } from '@/shared/ui/atoms/logo';
import { ToastStack } from '@/shared/ui/molecules/toast';

import { BarraInferior } from './barra-inferior';
import { PanelDeLaCuenta } from './panel-de-la-cuenta';
import { SideRail } from './side-rail';
import { type ShellState, useShellState } from './use-shell-state';

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
        <span>{t('shell.userView.notice')}</span>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="shrink-0"
          onClick={() => verComoUsuario(false)}
        >
          {t('common.backToAdmin')}
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
  const queryClient = useQueryClient();

  useEffect(
    () =>
      registrarPuente({
        ir: (ruta) => void navigate(ruta),
        abrirBusqueda,
        capturado: () => invalidateDerived(queryClient),
      }),
    [navigate, abrirBusqueda, queryClient],
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
  const shell = useShellState();

  return (
    // La página entera es EL MATERIAL —el mismo color de la tarjeta y del
    // riel— y el contenido se abre dentro como un pozo. El armazón entero
    // está explicado en el `<main>` de más abajo.
    <div className="flex min-h-dvh flex-col bg-sidebar">
      {/* ── Riel — escritorio ────────────────────────────────────────────────
          Se MONTA o no se monta, no se esconde con CSS: un riel escondido
          sigue siendo nueve enlaces en el orden de tabulación de un teléfono,
          y sus nombres siguen estando dos veces en la página. */}
      {!esMovil && !embebida && (
        <SideRail plegada={shell.plegada} onAlternar={shell.alternarBarra} />
      )}

      {/* ── Techo — teléfono ─────────────────────────────────────────────────
          Pegado arriba, que es el momento en el que hace falta que se entienda
          qué capa va encima: por eso la sombra va en el elemento PEGADO y no
          en uno cualquiera. */}
      {esMovil && !embebida && <PhoneTop />}

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
          embebida ? 'escritorio:pl-5' : shell.plegada ? 'escritorio:pl-16' : 'escritorio:pl-56',
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
            // en `components/ui/radius.test.ts`.
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

      {esMovil && !embebida && <PhoneSheets shell={shell} />}

      {/* La búsqueda y la ficha, en el teléfono Y dentro de la app: allí las
          abre la barra nativa a través de `PuenteDeNavegacion`. */}
      {(esMovil || embebida) && <SearchAndSheet shell={shell} />}

      {embebida && <PuenteDeNavegacion abrirBusqueda={shell.abrirBusqueda} />}

      <ToastStack />
    </div>
  );
}

/** La barra de abajo y sus dos hojas: solo en el teléfono, fuera de la app. */
function PhoneSheets({ shell }: { shell: ShellState }) {
  const { usuario } = useAuth();
  return (
    <>
      <BarraInferior
        nombre={usuario?.displayName ?? usuario?.email ?? '?'}
        busquedaAbierta={shell.busquedaAbierta}
        onBuscar={() => shell.setBusquedaAbierta(true)}
        // Directo al gasto, sin menú de por medio: es la única opción viva
        // de las dos que ofrece el menú de la pantalla ancha.
        onNuevoGasto={() => shell.setFicha(null)}
        atajosAbiertos={shell.atajosAbiertos}
        onAtajos={() => shell.setAtajosAbiertos(true)}
        cuentaAbierta={shell.cuentaAbierta}
        onCuenta={() => shell.setCuentaAbierta(true)}
      />

      {/* Las tres hojas van montadas siempre, abiertas o cerradas: lo que
          se desliza no se puede reconstruir en cada render, o aparece en
          vez de llegar. */}
      <BottomSheet
        isOpen={shell.atajosAbiertos}
        title={t('shell.shortcuts.title')}
        head={shell.cabeza}
        onClose={() => shell.setAtajosAbiertos(false)}
      >
        {shell.cuerpo}
      </BottomSheet>

      <PanelDeLaCuenta
        abierto={shell.cuentaAbierta}
        onCerrar={() => shell.setCuentaAbierta(false)}
      />
    </>
  );
}

/** La búsqueda y la ficha del movimiento que el armazón abre. */
function SearchAndSheet({ shell }: { shell: ShellState }) {
  return (
    <>
      <PanelDeBusqueda
        abierto={shell.busquedaAbierta}
        onCerrar={() => shell.setBusquedaAbierta(false)}
        // Encontrado el movimiento, la búsqueda se acabó: la hoja se cierra
        // y en su sitio se abre la ficha. Dejarla debajo obligaría a
        // cerrarla después, y con la ficha encima ya no se ve.
        onElegir={(movimiento) => {
          shell.setBusquedaAbierta(false);
          shell.setFicha(movimiento);
        }}
      />

      {/* Esta sí se monta al abrirse. No se desliza —entra con la animación
          de su propio velo, que corre por existir—, y montada siempre
          tendría sus consultas en pie en todas las pantallas del teléfono. */}
      {shell.ficha !== undefined && (
        <MovimientoModal
          abierta
          movimiento={shell.ficha}
          tipoPorDefecto="expense"
          onCerrar={() => shell.setFicha(undefined)}
        />
      )}
    </>
  );
}

function PhoneTop() {
  return (
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
  );
}
