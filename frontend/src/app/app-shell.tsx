import {
  LayoutDashboard,
  LogOut,
  Plus,
  ScrollText,
  ScanLine,
  ShieldCheck,
  Tags,
  UserCog,
  Wallet,
} from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';

import { Logo } from '@/components/logo';
import { Menu, MenuOpcion, MenuSeparador } from '@/components/menu';
import { MovimientoModal } from '@/features/transactions/movimiento-modal';
import { useAuth } from '@/lib/auth-context';
import { useLlevaCuentas } from '@/lib/preferences';
import { cn } from '@/lib/utils';

interface Seccion {
  to: string;
  label: string;
  /** Lo que se muestra en la barra inferior del móvil, donde no cabe el largo. */
  corto?: string;
  Icono: typeof Wallet;
  exact: boolean;
  /** Preferencia que debe estar activa para que la sección exista. */
  requiere?: 'cuentas';
}

/**
 * Secciones implementadas. El resto (Presupuestos, Fijos, Deudas, Reportes) se
 * añaden en su fase: mostrar enlaces muertos es peor que no mostrarlos.
 *
 * `requiere` marca las que dependen de una preferencia. Se declara aquí, en la
 * propia lista, para que el ORDEN del menú sea el orden de este arreglo y nada
 * más — insertar una sección condicional por posición se rompe en silencio en
 * cuanto alguien reordena.
 */
const SECCIONES: readonly Seccion[] = [
  { to: '/', label: 'Resumen', Icono: LayoutDashboard, exact: true },
  // Para quien no lleva cuentas, este enlace no existe. Ni oculto con CSS ni
  // deshabilitado: ausente.
  { to: '/cuentas', label: 'Cuentas', Icono: Wallet, exact: false, requiere: 'cuentas' },
  { to: '/centros-de-costos', label: 'Centros de costos', corto: 'Centros', Icono: Tags, exact: false },
  { to: '/importar', label: 'Importar', Icono: ScanLine, exact: false },
];

/**
 * Solo para administradores.
 *
 * No se muestran ocultos con CSS ni "deshabilitados": si no eres admin, estos
 * enlaces no existen en el DOM. Aun así, quien decide de verdad es el
 * RolesGuard del backend — esto es presentación, no control de acceso.
 */
const SECCIONES_DE_ADMIN = [
  // 'Usuarios', no 'Cuentas': en esta misma barra 'Cuentas' ya significa
  // tarjetas y ahorros. Dos cosas distintas con el mismo nombre a diez píxeles
  // de distancia.
  { to: '/administracion', label: 'Usuarios', Icono: ShieldCheck, exact: true },
  { to: '/administracion/bitacora', label: 'Bitácora', Icono: ScrollText, exact: false },
] as const;

export function AppShell() {
  const { esAdmin } = useAuth();
  const llevaCuentas = useLlevaCuentas();
  const [capturaAbierta, setCapturaAbierta] = useState(false);

  const seccionesVisibles = SECCIONES.filter(
    (seccion) => seccion.requiere !== 'cuentas' || llevaCuentas,
  );

  return (
    <div className="min-h-dvh bg-background">
      {/* Barra lateral — escritorio */}
      {/* 13rem y no 16: el enlace más largo, "Centros de costos", mide unos
          120px a 14px, y con el icono y los márgenes cabe de sobra. Lo que
          sobraba de ancho se lo estaba quitando al contenido. */}
      <aside className="fixed inset-y-0 left-0 hidden w-52 flex-col bg-sidebar p-3 md:flex">
        <div className="mb-8 flex justify-center px-2 pt-3">
          {/* Se le da ALTO: el logotipo es 3.82:1 y fijarle el ancho lo dejaría
              demasiado bajo para leerse en una barra de 256px. */}
          {/* Lima sobre la barra oscura: 10.1:1 de contraste, y es el acento de
              la marca. En blanco se leería igual pero sin carácter. */}
          <Logo className="h-7 w-auto text-lima-300" />
        </div>

        <nav className="flex flex-1 flex-col gap-1" aria-label="Secciones">
          {seccionesVisibles.map(({ to, label, Icono, exact }) => (
            <Enlace key={to} to={to} exact={exact}>
              <Icono className="size-[18px] shrink-0" fill="currentColor" fillOpacity={0.18} strokeWidth={1.75} aria-hidden="true" />
              {label}
            </Enlace>
          ))}

          {esAdmin && (
            <>
              <p className="mt-6 mb-1 px-4 text-[11px] font-semibold uppercase tracking-wider text-sidebar-muted">
                Administración
              </p>
              {SECCIONES_DE_ADMIN.map(({ to, label, Icono, exact }) => (
                <Enlace key={to} to={to} exact={exact}>
                  <Icono className="size-[18px] shrink-0" fill="currentColor" fillOpacity={0.18} strokeWidth={1.75} aria-hidden="true" />
                  {label}
                </Enlace>
              ))}
            </>
          )}
        </nav>

      </aside>

      {/* Contenido */}
      <div className="md:pl-52">
        {/*
          Cabecera. `sticky` y no `fixed`: así ocupa su sitio en el flujo y el
          contenido no queda tapado debajo, que es lo que obliga a compensar con
          un padding que luego nadie recuerda por qué está.
        */}
        <header className="sticky top-0 z-20 flex items-center justify-end gap-3 border-b border-border bg-background/85 px-4 py-3 backdrop-blur md:px-8 lg:px-10">
          <MenuDeLaCuenta />
        </header>

        <main className="w-full px-4 pb-28 pt-5 md:px-8 md:pb-16 md:pt-10 lg:px-10">
          <Outlet />
        </main>
      </div>

      {/* Barra inferior — móvil */}
      <nav
        className="fixed inset-x-0 bottom-0 z-10 flex bg-sidebar pb-[env(safe-area-inset-bottom)] md:hidden"
        aria-label="Secciones"
      >
        {seccionesVisibles.map(({ to, label, corto, Icono, exact }) => (
          <NavLink
            key={to}
            to={to}
            end={exact}
            className={({ isActive }) =>
              cn(
                'flex flex-1 flex-col items-center gap-1 py-2 text-[11px] transition-colors',
                // Objetivo táctil de 44px de alto mínimo.
                'min-h-[56px] justify-center',
                isActive ? 'text-sidebar-active-foreground' : 'text-sidebar-muted',
              )
            }
          >
            <Icono className="size-5" fill="currentColor" fillOpacity={0.18} strokeWidth={1.75} aria-hidden="true" />
            <span className="max-w-full truncate px-0.5">{corto ?? label}</span>
          </NavLink>
        ))}
      </nav>

      {/*
        Captura rápida siempre a un toque. Registrar un movimiento es la acción
        más frecuente del producto: si cuesta, el hábito se abandona.
      */}
      <button
        type="button"
        onClick={() => setCapturaAbierta(true)}
        aria-label="Registrar movimiento"
        className={cn(
          'fixed right-4 z-20 flex size-14 items-center justify-center rounded-full',
          'bg-primary text-primary-foreground shadow-lg transition-transform hover:scale-105',
          'focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
          'bottom-[calc(5.5rem+env(safe-area-inset-bottom))] md:bottom-8 md:right-8',
        )}
      >
        <Plus className="size-6" aria-hidden="true" />
      </button>

      <MovimientoModal
        abierta={capturaAbierta}
        movimiento={null}
        onCerrar={() => setCapturaAbierta(false)}
      />
    </div>
  );
}

/**
 * El menú de la cuenta.
 *
 * ── Por qué repite lo que ya está en la barra lateral ───────────────────────
 * Porque en un teléfono la barra lateral NO EXISTE: abajo solo caben las
 * secciones del día a día. Sin este menú, "Mi cuenta" y la administración
 * serían inalcanzables desde el móvil — no escondidas, inalcanzables.
 *
 * El correo va debajo del nombre porque la pregunta que uno se hace al pulsar
 * un avatar es "¿con qué cuenta estoy dentro?", y dos personas pueden llamarse
 * igual pero no tener el mismo correo.
 */
function MenuDeLaCuenta() {
  const { usuario, esAdmin, salir } = useAuth();
  const navegar = useNavigate();
  const nombre = usuario?.display_name ?? usuario?.email ?? '?';

  return (
    <Menu
      etiqueta="Tu cuenta"
      ancho="w-64"
      disparador={() => (
        <span className="flex items-center gap-3">
          <span className="hidden text-sm font-medium sm:block">{nombre}</span>
          <Avatar nombre={nombre} />
        </span>
      )}
    >
      {(cerrar) => (
        <>
          <div className="flex items-center gap-3 px-3 py-2">
            <Avatar nombre={nombre} />
            <span className="min-w-0">
              <span className="block truncate text-sm font-semibold">{nombre}</span>
              {usuario?.email && (
                <span className="block truncate text-xs text-muted-foreground">{usuario.email}</span>
              )}
            </span>
          </div>

          <MenuSeparador />

          <MenuOpcion
            Icono={UserCog}
            onClick={() => {
              cerrar();
              navegar('/mi-cuenta');
            }}
          >
            Mi cuenta
          </MenuOpcion>

          {esAdmin && (
            <>
              <MenuOpcion
                Icono={ShieldCheck}
                onClick={() => {
                  cerrar();
                  navegar('/administracion');
                }}
              >
                Usuarios
              </MenuOpcion>
              <MenuOpcion
                Icono={ScrollText}
                onClick={() => {
                  cerrar();
                  navegar('/administracion/bitacora');
                }}
              >
                Bitácora
              </MenuOpcion>
            </>
          )}

          <MenuSeparador />

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
function Avatar({ nombre }: { nombre: string }) {
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
      className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground"
    >
      {iniciales || '?'}
    </span>
  );
}

function Enlace({ to, exact, children }: { to: string; exact: boolean; children: ReactNode }) {
  return (
    <NavLink
      to={to}
      end={exact}
      className={({ isActive }) =>
        cn(
          // Esquinas suaves, no pastilla: en una barra estrecha la pastilla se
          // come el ancho por los lados y el texto queda pegado al icono.
          'flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
          isActive
            ? 'bg-sidebar-hover text-sidebar-active'
            : 'text-sidebar-muted hover:bg-sidebar-hover hover:text-sidebar-foreground',
        )
      }
    >
      {children}
    </NavLink>
  );
}
