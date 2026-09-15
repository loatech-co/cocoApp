import {
  ArrowLeftRight,
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
import { NavLink, Outlet } from 'react-router-dom';

import { CapturaRapida } from '@/features/transactions/captura-rapida';
import { useAuth } from '@/lib/auth-context';
import { useLlevaCuentas } from '@/lib/preferences';
import { cn } from '@/lib/utils';

interface Seccion {
  to: string;
  label: string;
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
  { to: '/movimientos', label: 'Movimientos', Icono: ArrowLeftRight, exact: false },
  // Para quien no lleva cuentas, este enlace no existe. Ni oculto con CSS ni
  // deshabilitado: ausente.
  { to: '/cuentas', label: 'Cuentas', Icono: Wallet, exact: false, requiere: 'cuentas' },
  { to: '/categorias', label: 'Categorías', Icono: Tags, exact: false },
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
  const { usuario, esAdmin, salir } = useAuth();
  const llevaCuentas = useLlevaCuentas();
  const [capturaAbierta, setCapturaAbierta] = useState(false);

  const seccionesVisibles = SECCIONES.filter(
    (seccion) => seccion.requiere !== 'cuentas' || llevaCuentas,
  );

  return (
    <div className="min-h-dvh bg-background">
      {/* Barra lateral — escritorio */}
      <aside className="fixed inset-y-0 left-0 hidden w-64 flex-col bg-sidebar p-4 md:flex">
        <div className="mb-8 flex items-center gap-3 px-2 pt-2">
          {/* La marca en un chip: le da peso sin necesitar un logotipo. */}
          <span className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-sidebar-active text-lg font-semibold text-sidebar-active-foreground">
            C
          </span>
          <span className="min-w-0">
            <span className="block font-serif text-xl font-semibold text-sidebar-foreground">
              Coco
            </span>
            <span className="block truncate text-xs text-sidebar-muted">
              {usuario?.display_name ?? usuario?.email}
            </span>
          </span>
        </div>

        <nav className="flex flex-1 flex-col gap-1" aria-label="Secciones">
          {seccionesVisibles.map(({ to, label, Icono, exact }) => (
            <Enlace key={to} to={to} exact={exact}>
              <Icono className="size-[18px] shrink-0" aria-hidden="true" />
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
                  <Icono className="size-[18px] shrink-0" aria-hidden="true" />
                  {label}
                </Enlace>
              ))}
            </>
          )}
        </nav>

        <div className="mt-4 flex flex-col gap-1 border-t border-sidebar-border pt-4">
          <Enlace to="/mi-cuenta" exact={false}>
            <UserCog className="size-[18px] shrink-0" aria-hidden="true" />
            Mi cuenta
          </Enlace>

          <button
            type="button"
            onClick={() => void salir()}
            className="flex items-center gap-3 rounded-full px-4 py-2.5 text-sm font-medium text-sidebar-muted transition-colors hover:bg-sidebar-hover hover:text-sidebar-foreground"
          >
            <LogOut className="size-[18px]" aria-hidden="true" />
            Salir
          </button>
        </div>
      </aside>

      {/* Contenido */}
      <div className="md:pl-64">
        <main className="mx-auto max-w-6xl px-4 pb-28 pt-6 md:px-10 md:pb-16 md:pt-10">
          <Outlet />
        </main>
      </div>

      {/* Barra inferior — móvil */}
      <nav
        className="fixed inset-x-0 bottom-0 z-10 flex bg-sidebar pb-[env(safe-area-inset-bottom)] md:hidden"
        aria-label="Secciones"
      >
        {seccionesVisibles.map(({ to, label, Icono, exact }) => (
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
            <Icono className="size-5" aria-hidden="true" />
            {label}
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
          'bottom-20 md:bottom-8 md:right-8',
        )}
      >
        <Plus className="size-6" aria-hidden="true" />
      </button>

      <CapturaRapida abierta={capturaAbierta} onCerrar={() => setCapturaAbierta(false)} />
    </div>
  );
}

function Enlace({ to, exact, children }: { to: string; exact: boolean; children: ReactNode }) {
  return (
    <NavLink
      to={to}
      end={exact}
      className={({ isActive }) =>
        cn(
          // Pastilla completa, no rectángulo redondeado: es lo que da el aire
          // de las referencias y separa la navegación del contenido, que es
          // todo esquinas de tarjeta.
          'flex items-center gap-3 rounded-full px-4 py-2.5 text-sm font-medium transition-colors',
          isActive
            ? 'bg-sidebar-active text-sidebar-active-foreground'
            : 'text-sidebar-muted hover:bg-sidebar-hover hover:text-sidebar-foreground',
        )
      }
    >
      {children}
    </NavLink>
  );
}
