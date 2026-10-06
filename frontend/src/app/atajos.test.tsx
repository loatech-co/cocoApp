// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { LayoutDashboard, ScrollText, ShieldCheck, Tags, UserCog, Wallet } from 'lucide-react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { forgetShortcuts } from '@/shared/lib/shortcuts';
import { ToastStack, clearToasts } from '@/shared/ui/molecules/toast';

import { useSuperficieDeAtajos, type PaginaDeAtajo } from './atajos';

afterEach(() => {
  cleanup();
  forgetShortcuts();
  clearToasts();
});

const BIBLIOTECA: PaginaDeAtajo[] = [
  { ruta: '/', etiqueta: 'Resumen', Icono: LayoutDashboard },
  { ruta: '/cuentas', etiqueta: 'Cuentas', Icono: Wallet },
  { ruta: '/administracion/bitacora', etiqueta: 'Bitácora', Icono: ScrollText },
  { ruta: '/centros-de-costos', etiqueta: 'Centros de costos', Icono: Tags },
  { ruta: '/administracion', etiqueta: 'Usuarios', Icono: ShieldCheck },
  { ruta: '/mi-cuenta', etiqueta: 'Mi cuenta', Icono: UserCog },
];

/** Doce páginas, para poder llegar al tope de nueve. */
const BIBLIOTECA_LARGA: PaginaDeAtajo[] = Array.from({ length: 12 }, (_, i) => ({
  ruta: `/p${i}`,
  etiqueta: `Página ${i}`,
  Icono: LayoutDashboard,
}));

function Superficie({
  abierto = true,
  porDefecto = ['/', '/administracion/bitacora'],
  biblioteca = BIBLIOTECA,
  onIr = vi.fn(),
}: {
  abierto?: boolean;
  porDefecto?: string[];
  biblioteca?: PaginaDeAtajo[];
  onIr?: () => void;
}) {
  const { cabeza, cuerpo } = useSuperficieDeAtajos({
    abierto,
    biblioteca,
    porDefecto,
    onIr,
  });
  return (
    <MemoryRouter>
      {cabeza}
      {cuerpo}
      <ToastStack />
    </MemoryRouter>
  );
}

describe('Los atajos', () => {
  it('empiezan en lo de fábrica, y son enlaces de verdad', () => {
    render(<Superficie />);

    const resumen = screen.getByText('Resumen').closest('a');
    expect(resumen?.getAttribute('href')).toBe('/');
    expect(screen.getByText('Bitácora').closest('a')).toBeTruthy();
    // Lo que no es baldosa no se pinta.
    expect(screen.queryByText('Usuarios')).toBeNull();
  });

  it('«Editar» saca los menos y el hueco de agregar', () => {
    render(<Superficie />);
    expect(screen.queryByLabelText('Quitar Resumen')).toBeNull();

    fireEvent.click(screen.getByText('Editar'));

    expect(screen.getByLabelText('Quitar Resumen')).toBeTruthy();
    expect(screen.getByText('Agregar atajo')).toBeTruthy();
    // Y la salida está donde estaba la entrada.
    expect(screen.getByText('Listo')).toBeTruthy();
  });

  it('mantener pulsada una baldosa entra a lo mismo', () => {
    vi.useFakeTimers();
    try {
      render(<Superficie />);
      const baldosa = screen.getByText('Resumen').closest('a')!;

      fireEvent.pointerDown(baldosa);
      // El reloj corre fuera de React: sin `act` el cambio de estado no llega
      // al DOM y la prueba mira una pantalla vieja.
      // Las llaves importan: sin ellas la flecha DEVUELVE lo que da
      // `advanceTimersByTime`, `act` lo toma por un thenable y pasa a
      // devolver una promesa que nadie espera.
      act(() => {
        vi.advanceTimersByTime(600);
      });

      expect(screen.getByLabelText('Quitar Resumen')).toBeTruthy();
    } finally {
      vi.useRealTimers();
    }
  });

  it('quitar escribe en el almacén, y el dibujo sale de ahí', () => {
    render(<Superficie />);
    fireEvent.click(screen.getByText('Editar'));

    fireEvent.click(screen.getByLabelText('Quitar Resumen'));

    expect(screen.queryByText('Resumen')).toBeNull();
    expect(screen.getByText('Bitácora')).toBeTruthy();
  });

  it('la lista de páginas enseña solo lo que NO se tiene', () => {
    render(<Superficie />);
    fireEvent.click(screen.getByText('Editar'));
    fireEvent.click(screen.getByText('Agregar atajo'));

    // Una fila para una página que ya se tiene solo podría significar
    // "quitar", y quitar es para lo que está el menos.
    expect(screen.queryByText('Bitácora')).toBeNull();
    expect(screen.getByText('Usuarios')).toBeTruthy();
    expect(screen.getByText('Centros de costos')).toBeTruthy();
  });

  it('el buscador filtra sin acentos', () => {
    render(<Superficie />);
    fireEvent.click(screen.getByText('Editar'));
    fireEvent.click(screen.getByText('Agregar atajo'));

    fireEvent.change(screen.getByLabelText('Buscar una página'), { target: { value: 'BITA' } });
    expect(screen.getByText('No hay ninguna página con ese nombre.')).toBeTruthy();

    fireEvent.change(screen.getByLabelText('Buscar una página'), { target: { value: 'cuent' } });
    expect(screen.getByText('Cuentas')).toBeTruthy();
  });

  it('elegir una página la añade y la saca de la lista', () => {
    render(<Superficie />);
    fireEvent.click(screen.getByText('Editar'));
    fireEvent.click(screen.getByText('Agregar atajo'));

    fireEvent.click(screen.getByText('Usuarios'));

    // La fila desaparece porque el almacén cambió y el render vuelve a leerlo.
    expect(screen.queryByRole('button', { name: 'Usuarios' })).toBeNull();

    fireEvent.click(screen.getByLabelText('Volver a los atajos'));
    expect(screen.getByText('Usuarios')).toBeTruthy();
  });

  it('sin nada por agregar, la lista lo dice', () => {
    render(<Superficie porDefecto={BIBLIOTECA.map((p) => p.ruta)} />);
    fireEvent.click(screen.getByText('Editar'));
    fireEvent.click(screen.getByText('Agregar atajo'));

    expect(screen.getByText('No queda ninguna página por agregar.')).toBeTruthy();
  });

  it('el décimo se contesta con un aviso, uno solo por muchas veces que se pida', () => {
    render(
      <Superficie
        biblioteca={BIBLIOTECA_LARGA}
        porDefecto={BIBLIOTECA_LARGA.slice(0, 9).map((p) => p.ruta)}
      />,
    );
    fireEvent.click(screen.getByText('Editar'));
    fireEvent.click(screen.getByText('Agregar atajo'));

    fireEvent.click(screen.getByText('Página 9'));
    fireEvent.click(screen.getByText('Página 10'));
    fireEvent.click(screen.getByText('Página 9'));

    // La respuesta llega cuando se hace la pregunta, y es UNA tarjeta por
    // mucho que se insista: ni un contador permanente ni un botón apagado.
    //
    // Se comprueban el titular Y el detalle: el aviso pasó de una línea a
    // dos, y con solo el titular la prueba seguiría en verde aunque el
    // detalle —que es el que dice cuántos caben y qué hacer— desapareciera.
    expect(screen.getAllByText('No caben más atajos')).toHaveLength(1);
    expect(screen.getAllByText('El máximo son 9. Quita uno para agregar otro.')).toHaveLength(1);
    // Y no entró ninguno.
    expect(screen.getByText('Página 9')).toBeTruthy();
    expect(screen.getByText('Página 10')).toBeTruthy();
  });

  it('cerrar olvida en qué estado quedó', () => {
    const { rerender } = render(<Superficie />);
    fireEvent.click(screen.getByText('Editar'));
    expect(screen.getByText('Listo')).toBeTruthy();

    rerender(<Superficie abierto={false} />);
    rerender(<Superficie abierto={true} />);

    // Una pantalla que se reabre en mitad de una edición se reabre mal.
    expect(screen.getByText('Editar')).toBeTruthy();
  });
});
