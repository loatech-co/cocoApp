// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { Filter } from 'lucide-react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { CONSULTA_MOVIL } from '@/shared/lib/movil';

import { Menu, MenuOption, MenuSeparator, MenuTitle } from './menu';

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
  const onSelect = vi.fn();
  render(
    <div>
      <p>Outside</p>
      <Menu label="Ordenar" {...props}>
        {(close) => (
          <>
            <MenuTitle>Orden</MenuTitle>
            <MenuOption
              isSelected
              onClick={() => {
                onSelect('fecha');
                close();
              }}
            >
              Fecha
            </MenuOption>
            <MenuSeparator />
            <MenuOption note="A-Z" onClick={() => onSelect('nombre')}>
              Nombre
            </MenuOption>
          </>
        )}
      </Menu>
    </div>,
  );
  return { onSelect, trigger: screen.getByRole('button', { name: /Ordenar/ }) };
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
    const { trigger, onSelect } = renderMenu();
    fireEvent.click(trigger);

    fireEvent.click(screen.getByRole('menuitem', { name: /Fecha/ }));

    expect(onSelect).toHaveBeenCalledWith('fecha');
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('uses the listbox role when it is a list and the dialog role when it is a panel', () => {
    render(
      <>
        <Menu label="Lista" kind="list">
          <span>a</span>
        </Menu>
        <Menu label="Panel" kind="panel">
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
      <Menu label="Filtrar" Icon={Filter} isIconOnly variant="ghost">
        <span>x</span>
      </Menu>,
    );

    const trigger = screen.getByRole('button', { name: 'Filtrar' });
    expect(trigger.getAttribute('title')).toBe('Filtrar');
    expect(trigger.textContent).toBe('');
  });

  it('marks the trigger pressed while it is active', () => {
    render(
      <Menu label="Filtrar" isActive>
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
        label="Cuenta"
        triggerId="cuenta"
        trigger={({ isOpen }) => <span>{isOpen ? 'abierto' : 'cerrado'}</span>}
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
        <Menu label="Mismo ancho" isFloating>
          <span>a</span>
        </Menu>
        <Menu label="Derecha" isFloating hasOwnWidth>
          <span>b</span>
        </Menu>
        <Menu label="Izquierda" isFloating hasOwnWidth align="left">
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
      <Menu label="Arriba" direction="up" align="left">
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
      <Menu label="Lista" kind="list">
        <span>a</span>
      </Menu>,
    );

    fireEvent.click(screen.getByRole('button', { name: /Lista/ }));

    expect(screen.getByRole('listbox', { name: 'Lista' })).toBeTruthy();
  });
});

describe('MenuOption', () => {
  it('cannot be chosen while disabled', () => {
    const onClick = vi.fn();
    render(
      <MenuOption disabled onClick={onClick}>
        Exportar
      </MenuOption>,
    );

    const option = screen.getByRole('menuitem', { name: 'Exportar' });
    fireEvent.click(option);

    expect(onClick).not.toHaveBeenCalled();
    expect(option.getAttribute('aria-disabled')).toBe('true');
  });

  it('paints a dangerous option in the error color', () => {
    render(
      <MenuOption isDestructive onClick={() => {}}>
        Eliminar
      </MenuOption>,
    );

    expect(screen.getByRole('menuitem', { name: 'Eliminar' }).className).toContain(
      'text-destructive',
    );
  });

  it('marks the chosen option with muted, not with the accent', () => {
    render(
      <MenuOption isSelected onClick={() => {}}>
        Fecha
      </MenuOption>,
    );

    expect(screen.getByRole('menuitem', { name: 'Fecha' }).className).toContain('bg-muted');
  });
});
