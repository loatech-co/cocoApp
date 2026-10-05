// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { Filter } from 'lucide-react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { CONSULTA_MOVIL } from '@/shared/lib/movil';

import { Menu, MenuOpcion, MenuSeparador, MenuTitulo } from './menu';

const matchMediaOriginal = window.matchMedia.bind(window);

afterEach(() => {
  cleanup();
  window.matchMedia = matchMediaOriginal;
});

/** jsdom does not evaluate media queries: the test tells it the answer. */
function onPhone(): void {
  window.matchMedia = ((query: string) => ({
    matches: query === CONSULTA_MOVIL,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  })) as unknown as typeof window.matchMedia;
}

function renderMenu(props: Partial<Parameters<typeof Menu>[0]> = {}) {
  const onElegir = vi.fn();
  render(
    <div>
      <p>Outside</p>
      <Menu etiqueta="Ordenar" {...props}>
        {(cerrar) => (
          <>
            <MenuTitulo>Orden</MenuTitulo>
            <MenuOpcion
              elegida
              onClick={() => {
                onElegir('fecha');
                cerrar();
              }}
            >
              Fecha
            </MenuOpcion>
            <MenuSeparador />
            <MenuOpcion nota="A-Z" onClick={() => onElegir('nombre')}>
              Nombre
            </MenuOpcion>
          </>
        )}
      </Menu>
    </div>,
  );
  return { onElegir, trigger: screen.getByRole('button', { name: /Ordenar/ }) };
}

describe('Menu', () => {
  it('starts closed and announces the kind of popup it opens', () => {
    const { trigger } = renderMenu();

    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    expect(trigger.getAttribute('aria-haspopup')).toBe('menu');
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('opens on click with a panel named after its trigger', () => {
    const { trigger } = renderMenu();

    fireEvent.click(trigger);

    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByRole('menu', { name: 'Ordenar' })).toBeTruthy();
    expect(screen.getAllByRole('menuitem')).toHaveLength(2);
  });

  it('closes when the trigger is clicked again', () => {
    const { trigger } = renderMenu();

    fireEvent.click(trigger);
    fireEvent.click(trigger);

    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('closes with Escape', () => {
    const { trigger } = renderMenu();
    fireEvent.click(trigger);

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(screen.queryByRole('menu')).toBeNull();
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
  });

  it('ignores keys other than Escape', () => {
    const { trigger } = renderMenu();
    fireEvent.click(trigger);

    fireEvent.keyDown(document, { key: 'Enter' });

    expect(screen.getByRole('menu')).toBeTruthy();
  });

  it('closes when the pointer goes down outside it', () => {
    const { trigger } = renderMenu();
    fireEvent.click(trigger);

    fireEvent.mouseDown(screen.getByText('Outside'));

    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('stays open when the pointer goes down inside it', () => {
    const { trigger } = renderMenu();
    fireEvent.click(trigger);

    fireEvent.mouseDown(screen.getByRole('menuitem', { name: /Nombre/ }));

    expect(screen.getByRole('menu')).toBeTruthy();
  });

  it('hands its children a function that closes it', () => {
    const { trigger, onElegir } = renderMenu();
    fireEvent.click(trigger);

    fireEvent.click(screen.getByRole('menuitem', { name: /Fecha/ }));

    expect(onElegir).toHaveBeenCalledWith('fecha');
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('uses the listbox role when it is a list and the dialog role when it is a panel', () => {
    render(
      <>
        <Menu etiqueta="Lista" tipo="lista">
          <span>a</span>
        </Menu>
        <Menu etiqueta="Panel" tipo="panel">
          <span>b</span>
        </Menu>
      </>,
    );

    fireEvent.click(screen.getByRole('button', { name: /Lista/ }));
    fireEvent.click(screen.getByRole('button', { name: /Panel/ }));

    expect(screen.getByRole('listbox', { name: 'Lista' })).toBeTruthy();
    expect(screen.getByRole('dialog', { name: 'Panel' })).toBeTruthy();
  });

  it('names an icon-only trigger with its label', () => {
    render(
      <Menu etiqueta="Filtrar" Icono={Filter} soloIcono variante="ghost">
        <span>x</span>
      </Menu>,
    );

    const trigger = screen.getByRole('button', { name: 'Filtrar' });
    expect(trigger.getAttribute('title')).toBe('Filtrar');
    expect(trigger.textContent).toBe('');
  });

  it('marks the trigger pressed while it is active', () => {
    render(
      <Menu etiqueta="Filtrar" activo>
        <span>x</span>
      </Menu>,
    );

    expect(screen.getByRole('button', { name: /Filtrar/ }).getAttribute('aria-pressed')).toBe(
      'true',
    );
  });

  it('renders a custom trigger that reports whether it is open', () => {
    render(
      <Menu
        etiqueta="Cuenta"
        idDisparador="cuenta"
        disparador={({ abierto }) => <span>{abierto ? 'abierto' : 'cerrado'}</span>}
      >
        <span>x</span>
      </Menu>,
    );

    const trigger = screen.getByRole('button', { name: 'cerrado' });
    expect(trigger.id).toBe('cuenta');

    fireEvent.click(trigger);

    expect(trigger.textContent).toBe('abierto');
    expect(screen.getByRole('menu', { name: 'Cuenta' })).toBeTruthy();
  });

  it('anchors a floating panel to the trigger box in the viewport', () => {
    const rect = vi
      .spyOn(HTMLElement.prototype, 'getBoundingClientRect')
      .mockReturnValue({ top: 10, bottom: 50, left: 20, right: 220, width: 200 } as DOMRect);

    render(
      <>
        <Menu etiqueta="Mismo ancho" flotante>
          <span>a</span>
        </Menu>
        <Menu etiqueta="Derecha" flotante anchoPropio>
          <span>b</span>
        </Menu>
        <Menu etiqueta="Izquierda" flotante anchoPropio alineado="izquierda">
          <span>c</span>
        </Menu>
      </>,
    );
    fireEvent.click(screen.getByRole('button', { name: /Mismo ancho/ }));
    fireEvent.click(screen.getByRole('button', { name: /Derecha/ }));
    fireEvent.click(screen.getByRole('button', { name: /Izquierda/ }));

    const sameWidth = screen.getByRole('menu', { name: 'Mismo ancho' });
    expect(sameWidth.style.width).toBe('200px');
    expect(sameWidth.style.top).toBe('58px');
    expect(sameWidth.className).toContain('fixed');

    expect(screen.getByRole('menu', { name: 'Derecha' }).style.right).not.toBe('');
    expect(screen.getByRole('menu', { name: 'Izquierda' }).style.left).toBe('20px');
    rect.mockRestore();
  });

  it('opens upwards when asked to', () => {
    render(
      <Menu etiqueta="Arriba" direccion="arriba" alineado="izquierda">
        <span>a</span>
      </Menu>,
    );

    fireEvent.click(screen.getByRole('button', { name: /Arriba/ }));

    expect(screen.getByRole('menu').className).toContain('bottom-full');
  });

  it('opens as a bottom sheet on a phone, and Escape still closes it', () => {
    onPhone();
    const { trigger } = renderMenu();

    fireEvent.click(trigger);

    const sheet = screen.getByRole('dialog', { name: 'Ordenar' });
    expect(sheet.getAttribute('data-abierta')).toBe('si');

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(sheet.getAttribute('data-abierta')).toBe('no');
  });

  it('keeps a list hanging from its trigger on a phone', () => {
    onPhone();
    render(
      <Menu etiqueta="Lista" tipo="lista">
        <span>a</span>
      </Menu>,
    );

    fireEvent.click(screen.getByRole('button', { name: /Lista/ }));

    expect(screen.getByRole('listbox', { name: 'Lista' })).toBeTruthy();
  });
});

describe('MenuOpcion', () => {
  it('cannot be chosen while disabled', () => {
    const onClick = vi.fn();
    render(
      <MenuOpcion deshabilitada onClick={onClick}>
        Exportar
      </MenuOpcion>,
    );

    const option = screen.getByRole('menuitem', { name: 'Exportar' });
    fireEvent.click(option);

    expect(onClick).not.toHaveBeenCalled();
    expect(option.getAttribute('aria-disabled')).toBe('true');
  });

  it('paints a dangerous option in the error colour', () => {
    render(
      <MenuOpcion peligro onClick={() => {}}>
        Eliminar
      </MenuOpcion>,
    );

    expect(screen.getByRole('menuitem', { name: 'Eliminar' }).className).toContain(
      'text-destructive',
    );
  });

  it('marks the chosen option with muted, not with the accent', () => {
    render(
      <MenuOpcion elegida onClick={() => {}}>
        Fecha
      </MenuOpcion>,
    );

    expect(screen.getByRole('menuitem', { name: 'Fecha' }).className).toContain('bg-muted');
  });
});
