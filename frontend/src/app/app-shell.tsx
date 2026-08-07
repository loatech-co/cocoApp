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
import { cn } from '@/lib/utils';

/**
 * Secciones implementadas. El resto (Importar, Presupuestos, Fijos, Deudas,
 * Metas, Reportes) se añaden en su fase: mostrar enlaces muertos es peor que
 * no mostrarlos.
 */
const SECCIONES = [
  { to: '/', label: 'Resumen', Icono: LayoutDashboard, exact: true },
  { to: '/movimientos', label: 'Movimientos', Icono: ArrowLeftRight, exact: false },
  { to: '/cuentas', label: 'Cuentas', Icono: Wallet, exact: false },
  { to: '/categorias', label: 'Categorías', Icono: Tags, exact: false },
  { to: '/importar', label: 'Importar', Icono: ScanLine, exact: false },
] as const;

/**
 * Solo para administradores.
 *
 * No se muestran ocultos con CSS ni "deshabilitados": si no eres admin, estos
 * enlaces no existen en el DOM. Aun así, quien decide de verdad es el
 * RolesGuard del backend — esto es presentación, no control de acceso.
 */
const SECCIONES_DE_ADMIN = [
  { to: '/administracion', label: 'Cuentas', Icono: ShieldCheck, exact: true },
  { to: '/administracion/bitacora', label: 'Bitácora', Icono: ScrollText, exact: false },
] as const;

export function AppShell() {
  const { usuario, esAdmin, salir } = useAuth();
  const [capturaAbierta, setCapturaAbierta] = useState(false);

  return (
    <div className="min-h-dvh bg-background">
      {/* Barra lateral — escritorio */}
      <aside className="fixed inset-y-0 left-0 hidden w-60 flex-col border-r border-border bg-card p-4 md:flex">
        <div className="mb-8 px-2">
          <p className="font-serif text-2xl font-semibold text-primary">Coco</p>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">
            {usuario?.display_name ?? usuario?.email}
          </p>
        </div>

        <nav className="flex flex-1 flex-col gap-1" aria-label="Secciones">
          {SECCIONES.map(({ to, label, Icono, exact }) => (
            <Enlace key={to} to={to} exact={exact}>
              <Icono className="size-4 shrink-0" aria-hidden="true" />
              {label}
            </Enlace>
          ))}

          {esAdmin && (
            <>
              <p className="mt-6 px-3 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Administración
              </p>
              {SECCIONES_DE_ADMIN.map(({ to, label, Icono, exact }) => (
                <Enlace key={to} to={to} exact={exact}>
                  <Icono className="size-4 shrink-0" aria-hidden="true" />
                  {label}
                </Enlace>
              ))}
            </>
          )}
        </nav>

        <Enlace to="/mi-cuenta" exact={false}>
          <UserCog className="size-4 shrink-0" aria-hidden="true" />
          Mi cuenta
        </Enlace>

        <button
          type="button"
          onClick={() => void salir()}
          className="flex items-center gap-2 rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
        >
          <LogOut className="size-4" aria-hidden="true" />
          Salir
        </button>
      </aside>

      {/* Contenido */}
      <div className="md:pl-60">
        <main className="mx-auto max-w-5xl px-4 pb-28 pt-6 md:px-8 md:pb-12">
          <Outlet />
        </main>
      </div>

      {/* Barra inferior — móvil */}
      <nav
        className="fixed inset-x-0 bottom-0 z-10 flex border-t border-border bg-card md:hidden"
        aria-label="Secciones"
      >
        {SECCIONES.map(({ to, label, Icono, exact }) => (
          <NavLink
            key={to}
            to={to}
            end={exact}
            className={({ isActive }) =>
              cn(
                'flex flex-1 flex-col items-center gap-1 py-2 text-[11px] transition-colors',
                // Objetivo táctil de 44px de alto mínimo.
                'min-h-[56px] justify-center',
                isActive ? 'text-primary' : 'text-muted-foreground',
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
          'flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium transition-colors',
          isActive
            ? 'bg-primary text-primary-foreground'
            : 'text-muted-foreground hover:bg-secondary hover:text-foreground',
        )
      }
    >
      {children}
    </NavLink>
  );
}
