import { Eye, LogOut, ScrollText, ShieldCheck, Tags, UserCog } from 'lucide-react';
import { type ReactNode } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';

import { useLlevaCuentas } from '@/features/profile/api/preferences';
import { useAuth } from '@/shared/api/auth-context';
import { MI_CUENTA, SECCIONES, SECCIONES_DE_ADMIN, type Seccion } from '@/shared/lib/sections';
import { cn } from '@/shared/lib/utils';
import { Menu, MenuOpcion, MenuSeparador } from '@/shared/ui/molecules/menu';

/**
 * La navegación: las secciones, la fila que las pinta y el menú de la cuenta.
 *
 * ── Por qué en un módulo propio y no dentro del armazón ─────────────────────
 * Porque las usan TRES sitios: el riel del escritorio, el panel del teléfono y
 * la barra de abajo. Dos copias empiezan iguales y se separan —una aprende que
 * una sección depende de una preferencia y la otra no—, y entonces la misma
 * aplicación ofrece cosas distintas según por dónde se entre.
 */

/**
 * Qué secciones existen para quien ha entrado.
 *
 * `biblioteca` son TODAS sus hojas, en el orden del menú. De ahí salen los
 * atajos: una segunda lista de las páginas del producto se separaría de esta
 * la primera vez que se añada una pantalla, y la separación no se vería.
 */
export function useSecciones(): {
  diaADia: readonly Seccion[];
  administracion: readonly Seccion[];
  biblioteca: readonly Seccion[];
} {
  const { esAdmin } = useAuth();
  const llevaCuentas = useLlevaCuentas();

  const diaADia = SECCIONES.filter((s) => s.requiere !== 'cuentas' || llevaCuentas);
  const administracion = esAdmin ? SECCIONES_DE_ADMIN : [];

  return { diaADia, administracion, biblioteca: [...diaADia, ...administracion, MI_CUENTA] };
}

export function EnlaceDeSeccion({
  to,
  exact,
  plegada = false,
  titulo,
  children,
}: {
  to: string;
  exact: boolean;
  plegada?: boolean;
  /** El nombre de la sección. Plegada, es lo único que queda para saberlo. */
  titulo?: string;
  children: ReactNode;
}) {
  return (
    <NavLink
      to={to}
      end={exact}
      title={plegada ? titulo : undefined}
      aria-label={plegada ? titulo : undefined}
      className={({ isActive }) =>
        cn(
          // Esquinas suaves, no pastilla: en una barra estrecha la pastilla se
          // come el ancho por los lados y el texto queda pegado al icono.
          'flex items-center gap-2.5 rounded-lg py-2.5 text-sm font-medium transition-colors',
          // En el teléfono la fila sube a 48: es la medida de una fila que se
          // toca, por encima del suelo de 42 porque aquí sobra alto y una
          // lista de nueve se recorre con el pulgar.
          'movil:min-h-[48px]',
          plegada ? 'justify-center px-0' : 'px-3',
          // ── Solo lo ELEGIDO lleva fondo ─────────────────────────────────
          // El paso del cursor no pinta ninguno. Llevaba `sidebar-hover`, que
          // en oscuro es un verde #1e3b30, y en una columna de cuatro filas
          // eso es un rectángulo verde saltando de una a otra con el ratón:
          // pesa tanto como el sitio donde uno está y compite con él.
          //
          // Un fondo es para decir «aquí estás», que es un estado y dura. Un
          // hover dura lo que el cursor tarda en pasar, y para eso basta lo
          // más barato que hay: la letra y su icono se ACLARAN, de
          // `sidebar-muted` a `sidebar-foreground`. No a blanco puro —#e8edeb,
          // no #fff— porque el blanco a plena tinta sobre una columna oscura
          // pesa más que el contenido que se ha venido a leer.
          //
          // El icono se aclara solo: va en `currentColor`.
          //
          // Antes los dos compartían fondo y se distinguían por el color de la
          // letra, así que pasar por encima de la sección en la que uno ya
          // está no cambiaba nada, y pasar por cualquier otra parecía que se
          // había navegado.
          //
          // Lo activo lleva `--sidebar-active`, que es el color con el que
          // este tema dice "estás aquí".
          //
          // ── Pero LAVADO, no macizo ────────────────────────────────────────
          // Era un bloque relleno de ese color con la tinta oscura encima. Con
          // el acento en lima eso es un rectángulo del color más fuerte de la
          // app encendido de forma permanente, en la columna que uno mira de
          // reojo: pesaba más que el contenido, que es lo que se ha venido a
          // leer. Y un color que está siempre a todo volumen deja de señalar.
          //
          // Ahora el color lo lleva la LETRA, que es lo que hay que leer, y el
          // fondo es un lavado PLANO del mismo color.
          //
          // Se probó con degradado y con un filo de dentro, y sobraban los
          // dos: el degradado le da al fondo una dirección que la fila no
          // tiene —no pasa nada de izquierda a derecha ahí— y el filo dibuja
          // una caja alrededor de algo que no es un control, solo el sitio
          // donde uno está. Lo que hace falta es que se distinga del resto, y
          // para eso basta el lavado.
          isActive
            ? 'bg-sidebar-active/15 font-semibold text-sidebar-active'
            : 'text-sidebar-muted hover:text-sidebar-foreground',
        )
      }
    >
      {children}
    </NavLink>
  );
}

/**
 * El menú de la cuenta.
 *
 * ── Por qué repite lo que ya está en la navegación ──────────────────────────
 * Porque la pregunta que se contesta aquí no es "a dónde voy" sino "¿con qué
 * cuenta estoy dentro?", y de paso es el único sitio donde se sale.
 *
 * El correo va debajo del nombre porque dos personas pueden llamarse igual y
 * no tener el mismo correo.
 */
export function MenuDeLaCuenta({ plegada = false }: { plegada?: boolean }) {
  const { usuario, esAdmin, esAdminDeVerdad, viendoComoUsuario, verComoUsuario, salir } = useAuth();
  const navegar = useNavigate();
  const nombre = usuario?.display_name ?? usuario?.email ?? '?';

  return (
    <Menu
      etiqueta="Tu cuenta"
      ancho="w-60"
      alineado="izquierda"
      direccion="arriba"
      claseCaja="w-full"
      claseDisparador={cn(
        // Sin fondo al pasar por encima, como las secciones: es la misma
        // columna, y un verde apareciendo solo aquí se leería como un control
        // de otra familia.
        'flex w-full min-w-0 items-center gap-2.5 rounded-lg py-2 text-left outline-none',
        'movil:min-h-[42px]',
        plegada ? 'justify-center px-0' : 'px-2',
      )}
      disparador={() => (
        <>
          <Avatar nombre={nombre} />
          {!plegada && (
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium text-sidebar-foreground">
                {usuario?.display_name ?? '—'}
              </span>
              {usuario?.email && (
                <span className="block truncate text-2xs text-sidebar-muted">{usuario.email}</span>
              )}
            </span>
          )}
        </>
      )}
    >
      {(cerrar) => (
        <>
          {/*
            `void` delante de cada `navegar` no es adorno: en react-router 7
            `navigate` devuelve una promesa, y aquí se llama desde un `onClick`
            que no puede esperarla. El `void` dice que es a propósito —navegar
            es de ida sin vuelta— y es lo que distingue esto de la promesa que
            alguien se olvidó de atender.
          */}
          <MenuOpcion
            Icono={UserCog}
            onClick={() => {
              cerrar();
              void navegar('/mi-cuenta');
            }}
          >
            Mi cuenta
          </MenuOpcion>

          <MenuOpcion
            Icono={Tags}
            onClick={() => {
              cerrar();
              void navegar('/centros-de-costos');
            }}
          >
            Centros de costos
          </MenuOpcion>

          {esAdmin && (
            <>
              <MenuOpcion
                Icono={ShieldCheck}
                onClick={() => {
                  cerrar();
                  void navegar('/administracion');
                }}
              >
                Usuarios
              </MenuOpcion>
              <MenuOpcion
                Icono={ScrollText}
                onClick={() => {
                  cerrar();
                  void navegar('/administracion/bitacora');
                }}
              >
                Bitácora
              </MenuOpcion>
            </>
          )}

          <MenuSeparador />

          {/*
            ── Ver la aplicación como la ve quien no administra nada ────────
            Se enseña con el rol DE VERDAD, no con el efectivo: encendida la
            vista, `esAdmin` es falso, y con esa condición el interruptor
            desaparecería justo cuando hace falta para apagarlo.

            Va aquí abajo, con cerrar sesión y no con las páginas: no lleva a
            ninguna parte, cambia cómo se ve todo lo demás.
          */}
          {esAdminDeVerdad && (
            <MenuOpcion
              Icono={viendoComoUsuario ? ShieldCheck : Eye}
              onClick={() => {
                cerrar();
                verComoUsuario(!viendoComoUsuario);
                // Encendiéndola desde una pantalla de administración, quedarse
                // sería quedarse mirando un «no tienes acceso». Se sale al
                // resumen, que es de donde parte quien no administra nada.
                if (!viendoComoUsuario) void navegar('/');
              }}
            >
              {viendoComoUsuario ? 'Volver a administrador' : 'Ver como usuario'}
            </MenuOpcion>
          )}

          <MenuOpcion Icono={LogOut} peligro onClick={() => void salir()}>
            Cerrar sesión
          </MenuOpcion>
        </>
      )}
    </Menu>
  );
}

/**
 * Avatar con las iniciales.
 *
 * No hay fotos de perfil en el producto, así que una imagen genérica de persona
 * sería ruido: no identifica a nadie. Las iniciales sí, y de paso confirman con
 * qué cuenta se está dentro, que es la pregunta que uno se hace al ver un
 * avatar.
 */
export function Avatar({ nombre, className }: { nombre: string; className?: string }) {
  const iniciales = nombre
    .trim()
    .split(/[\s@._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((parte) => parte[0]?.toUpperCase() ?? '')
    .join('');

  return (
    <span
      title={nombre}
      className={cn(
        'flex size-9 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground',
        className,
      )}
    >
      {iniciales || '?'}
    </span>
  );
}
