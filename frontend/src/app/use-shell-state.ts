import type { ReactNode } from 'react';
import { useState } from 'react';
import { useLocation } from 'react-router-dom';

import { useAlCambiar } from '@/shared/lib/al-cambiar';
import type { Transaction } from '@coco/types';

import { useSuperficieDeAtajos } from './atajos';
import { useSecciones } from './navegacion';

type Setter<T> = (valor: T) => void;

/** Lo que el armazón tiene abierto, y cómo se abre y se cierra. */
export interface ShellState {
  plegada: boolean;
  alternarBarra: () => void;
  atajosAbiertos: boolean;
  setAtajosAbiertos: Setter<boolean>;
  busquedaAbierta: boolean;
  setBusquedaAbierta: Setter<boolean>;
  cuentaAbierta: boolean;
  setCuentaAbierta: Setter<boolean>;
  ficha: Transaction | null | undefined;
  setFicha: Setter<Transaction | null | undefined>;
  abrirBusqueda: () => void;
  cabeza: ReactNode;
  cuerpo: ReactNode;
}

export function useShellState(): ShellState {
  const { diaADia, biblioteca } = useSecciones();
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

  return {
    plegada,
    alternarBarra,
    atajosAbiertos,
    setAtajosAbiertos,
    busquedaAbierta,
    setBusquedaAbierta,
    cuentaAbierta,
    setCuentaAbierta,
    ficha,
    setFicha,
    abrirBusqueda,
    cabeza,
    cuerpo,
  };
}
