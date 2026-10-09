// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { LayoutDashboard, ScrollText, ShieldCheck, Tags, UserCog, Wallet } from 'lucide-react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { forgetShortcuts } from '@/shared/lib/shortcuts';
import { ToastStack, clearToasts } from '@/shared/ui/molecules/toast';

import { useShortcutsSurface, type PaginaDeAtajo } from './shortcuts';

afterEach(() => {
  cleanup();
  forgetShortcuts();
  clearToasts();
});

const LIBRARY: PaginaDeAtajo[] = [
  { route: '/', label: 'Resumen', Icon: LayoutDashboard },
  { route: '/cuentas', label: 'Cuentas', Icon: Wallet },
  { route: '/administracion/bitacora', label: 'Bitácora', Icon: ScrollText },
  { route: '/centros-de-costos', label: 'Centros de costos', Icon: Tags },
  { route: '/administracion', label: 'Usuarios', Icon: ShieldCheck },
  { route: '/mi-cuenta', label: 'Mi cuenta', Icon: UserCog },
];

/** Twelve pages, to be able to reach the cap of nine. */
const LONG_LIBRARY: PaginaDeAtajo[] = Array.from({ length: 12 }, (_, i) => ({
  route: `/p${i}`,
  label: `Página ${i}`,
  Icon: LayoutDashboard,
}));

function Surface({
  isOpen = true,
  defaults = ['/', '/administracion/bitacora'],
  library = LIBRARY,
  onGo = vi.fn(),
}: {
  isOpen?: boolean;
  defaults?: string[];
  library?: PaginaDeAtajo[];
  onGo?: () => void;
}) {
  const { header, body } = useShortcutsSurface({
    isOpen,
    library,
    defaults,
    onGo,
  });
  return (
    <MemoryRouter>
      {header}
      {body}
      <ToastStack />
    </MemoryRouter>
  );
}

describe('The shortcuts', () => {
  it('start with the defaults, and are real links', () => {
    render(<Surface />);

    const summary = screen.getByText('Resumen').closest('a');
    expect(summary?.getAttribute('href')).toBe('/');
    expect(screen.getByText('Bitácora').closest('a')).toBeTruthy();
    // What is not a tile is not drawn.
    expect(screen.queryByText('Usuarios')).toBeNull();
  });

  it('«Editar» brings out the minuses and the add slot', () => {
    render(<Surface />);
    expect(screen.queryByLabelText('Quitar Resumen')).toBeNull();

    fireEvent.click(screen.getByText('Editar'));

    expect(screen.getByLabelText('Quitar Resumen')).toBeTruthy();
    expect(screen.getByText('Agregar atajo')).toBeTruthy();
    // And the exit is where the entrance was.
    expect(screen.getByText('Listo')).toBeTruthy();
  });

  it('holding a tile enters the same mode', () => {
    vi.useFakeTimers();
    try {
      render(<Surface />);
      const tile = screen.getByText('Resumen').closest('a')!;

      fireEvent.pointerDown(tile);
      // The clock runs outside React: without `act` the state change does not
      // reach the DOM and the test looks at a stale screen.
      // The braces matter: without them the arrow RETURNS what
      // `advanceTimersByTime` gives, `act` takes it for a thenable and starts
      // returning a promise nobody awaits.
      act(() => {
        vi.advanceTimersByTime(600);
      });

      expect(screen.getByLabelText('Quitar Resumen')).toBeTruthy();
    } finally {
      vi.useRealTimers();
    }
  });

  it('removing writes to the store, and the drawing comes from there', () => {
    render(<Surface />);
    fireEvent.click(screen.getByText('Editar'));

    fireEvent.click(screen.getByLabelText('Quitar Resumen'));

    expect(screen.queryByText('Resumen')).toBeNull();
    expect(screen.getByText('Bitácora')).toBeTruthy();
  });

  it('the list of pages shows only what one does NOT have', () => {
    render(<Surface />);
    fireEvent.click(screen.getByText('Editar'));
    fireEvent.click(screen.getByText('Agregar atajo'));

    // A row for a page one already has could only mean "remove", and
    // removing is what the minus is for.
    expect(screen.queryByText('Bitácora')).toBeNull();
    expect(screen.getByText('Usuarios')).toBeTruthy();
    expect(screen.getByText('Centros de costos')).toBeTruthy();
  });

  it('the search box filters ignoring accents', () => {
    render(<Surface />);
    fireEvent.click(screen.getByText('Editar'));
    fireEvent.click(screen.getByText('Agregar atajo'));

    fireEvent.change(screen.getByLabelText('Buscar una página'), { target: { value: 'BITA' } });
    expect(screen.getByText('No hay ninguna página con ese nombre.')).toBeTruthy();

    fireEvent.change(screen.getByLabelText('Buscar una página'), { target: { value: 'cuent' } });
    expect(screen.getByText('Cuentas')).toBeTruthy();
  });

  it('picking a page adds it and takes it off the list', () => {
    render(<Surface />);
    fireEvent.click(screen.getByText('Editar'));
    fireEvent.click(screen.getByText('Agregar atajo'));

    fireEvent.click(screen.getByText('Usuarios'));

    // The row disappears because the store changed and the render reads it again.
    expect(screen.queryByRole('button', { name: 'Usuarios' })).toBeNull();

    fireEvent.click(screen.getByLabelText('Volver a los atajos'));
    expect(screen.getByText('Usuarios')).toBeTruthy();
  });

  it('with nothing left to add, the list says so', () => {
    render(<Surface defaults={LIBRARY.map((p) => p.route)} />);
    fireEvent.click(screen.getByText('Editar'));
    fireEvent.click(screen.getByText('Agregar atajo'));

    expect(screen.getByText('No queda ninguna página por agregar.')).toBeTruthy();
  });

  it('the tenth is answered with a notice, only one however many times it is asked', () => {
    render(
      <Surface library={LONG_LIBRARY} defaults={LONG_LIBRARY.slice(0, 9).map((p) => p.route)} />,
    );
    fireEvent.click(screen.getByText('Editar'));
    fireEvent.click(screen.getByText('Agregar atajo'));

    fireEvent.click(screen.getByText('Página 9'));
    fireEvent.click(screen.getByText('Página 10'));
    fireEvent.click(screen.getByText('Página 9'));

    // The answer comes when the question is asked, and it is ONE card however
    // much one insists: no permanent counter and no disabled button.
    //
    // Both the headline AND the detail are checked: the notice went from one
    // line to two, and with only the headline the test would stay green even
    // if the detail —the one that says how many fit and what to do—
    // disappeared.
    expect(screen.getAllByText('No caben más atajos')).toHaveLength(1);
    expect(screen.getAllByText('El máximo son 9. Quita uno para agregar otro.')).toHaveLength(1);
    // And none went in.
    expect(screen.getByText('Página 9')).toBeTruthy();
    expect(screen.getByText('Página 10')).toBeTruthy();
  });

  it('closing forgets the state it was left in', () => {
    const { rerender } = render(<Surface />);
    fireEvent.click(screen.getByText('Editar'));
    expect(screen.getByText('Listo')).toBeTruthy();

    rerender(<Surface isOpen={false} />);
    rerender(<Surface isOpen={true} />);

    // A screen that reopens in the middle of an edit reopens wrong.
    expect(screen.getByText('Editar')).toBeTruthy();
  });
});
