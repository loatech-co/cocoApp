import type { ReactNode } from 'react';
import { useState } from 'react';
import { useLocation } from 'react-router-dom';

import { type Transaction } from '@/shared/api/generated/model';
import { useOnChange } from '@/shared/lib/on-change';

import { useSections } from './navigation';
import { useShortcutsSurface } from './shortcuts';

type Setter<T> = (value: T) => void;

/** Lo que el armazón tiene abierto, y cómo se abre y se cierra. */
export interface ShellState {
  isCollapsed: boolean;
  toggleBar: () => void;
  isShortcutsOpen: boolean;
  setIsShortcutsOpen: Setter<boolean>;
  isSearchOpen: boolean;
  setIsSearchOpen: Setter<boolean>;
  isAccountOpen: boolean;
  setIsAccountOpen: Setter<boolean>;
  sheet: Transaction | null | undefined;
  setSheet: Setter<Transaction | null | undefined>;
  openSearch: () => void;
  header: ReactNode;
  body: ReactNode;
}

export function useShellState(): ShellState {
  const { daily, library } = useSections();
  const location = useLocation();

  /**
   * La barra plegada.
   *
   * Se recuerda en `localStorage` y no en la URL ni en el servidor: es una
   * preferencia de ESTA pantalla, de este momento. Pegarle un enlace a alguien
   * no debería plegarle la barra, y cambiarla no tiene por qué viajar a la red.
   */
  const [isCollapsed, setIsCollapsed] = useState(
    () => localStorage.getItem('sidenav-plegada') === 'si',
  );

  const [isShortcutsOpen, setIsShortcutsOpen] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isAccountOpen, setIsAccountOpen] = useState(false);

  /**
   * La ficha que el armazón tiene abierta.
   *
   * `undefined` es cerrada, `null` es una nueva y un movimiento es ese. Es la
   * misma convención que usa el resumen, y a propósito: abrir un gasto desde
   * el (+) de la barra o desde un resultado de la búsqueda no puede ser otra
   * ficha ni otro formulario que abrirlo desde la tabla.
   */
  const [sheet, setSheet] = useState<Transaction | null | undefined>(undefined);

  // Cambiar de página cierra lo que esté tapándola. Una hoja que sobrevive a
  // su propio enlace deja a la persona mirando los atajos de una pantalla que
  // ya no está debajo.
  useOnChange([location.pathname], () => {
    setIsShortcutsOpen(false);
    setIsSearchOpen(false);
    setIsAccountOpen(false);
  });

  // Estable entre renders: es lo que el puente publica, y un `useEffect` que
  // dependa de ella no tiene por qué volver a registrarse en cada pintado.
  const [openSearch] = useState(() => () => setIsSearchOpen(true));

  function toggleBar(): void {
    setIsCollapsed((wasCollapsed) => {
      localStorage.setItem('sidenav-plegada', wasCollapsed ? 'no' : 'si');
      return !wasCollapsed;
    });
  }

  const { header, body } = useShortcutsSurface({
    isOpen: isShortcutsOpen,
    library: library.map(({ to, label, Icon }) => ({
      route: to,
      label,
      Icon,
    })),
    // Lo de fábrica es lo del día a día. Lo de administración se configura una
    // vez y casi no se toca: está en el menú, y se añade desde ahí quien lo use.
    defaults: daily.map((s) => s.to),
    onGo: () => setIsShortcutsOpen(false),
  });

  return {
    isCollapsed,
    toggleBar,
    isShortcutsOpen,
    setIsShortcutsOpen,
    isSearchOpen,
    setIsSearchOpen,
    isAccountOpen,
    setIsAccountOpen,
    sheet,
    setSheet,
    openSearch,
    header,
    body,
  };
}
