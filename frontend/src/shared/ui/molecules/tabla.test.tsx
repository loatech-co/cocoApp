// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { Tabla, TablaEsqueleto, TablaPie, Td, Th, Tr } from './tabla';

afterEach(cleanup);

describe('Tabla', () => {
  it('renders a real table with column headers, rows and a footer', () => {
    render(
      <Tabla>
        <thead>
          <tr>
            <Th fija>Concepto</Th>
            <Th alineado="derecha">Valor</Th>
          </tr>
        </thead>
        <tbody>
          <Tr>
            <Td fija>Aseo</Td>
            <Td alineado="derecha">x</Td>
          </Tr>
        </tbody>
        <TablaPie>
          <tr>
            <Td>Total</Td>
            <Td />
          </tr>
        </TablaPie>
      </Tabla>,
    );

    const table = screen.getByRole('table');
    expect(within(table).getAllByRole('columnheader')).toHaveLength(2);
    expect(screen.getByRole('columnheader', { name: 'Concepto' }).getAttribute('scope')).toBe(
      'col',
    );
    expect(within(table).getAllByRole('row')).toHaveLength(3);
    expect(screen.getByRole('cell', { name: 'Aseo' }).className).toContain('sticky');
  });
});

describe('Th', () => {
  it('is plain text when the column cannot be sorted', () => {
    render(
      <table>
        <thead>
          <tr>
            <Th>Fecha</Th>
          </tr>
        </thead>
      </table>,
    );

    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.getByRole('columnheader').hasAttribute('aria-sort')).toBe(false);
  });

  it.each([
    ['asc', 'ascending'],
    ['desc', 'descending'],
  ] as const)('announces the %s order with aria-sort', (activo, aria) => {
    render(
      <table>
        <thead>
          <tr>
            <Th alineado="derecha" orden={{ activo, onCambiar: vi.fn() }}>
              Valor
            </Th>
          </tr>
        </thead>
      </table>,
    );

    expect(screen.getByRole('columnheader').getAttribute('aria-sort')).toBe(aria);
  });

  it('sorts through a button inside the header', () => {
    const onCambiar = vi.fn();
    render(
      <table>
        <thead>
          <tr>
            <Th orden={{ activo: null, onCambiar }}>Fecha</Th>
          </tr>
        </thead>
      </table>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Fecha' }));

    expect(onCambiar).toHaveBeenCalledOnce();
    expect(screen.getByRole('columnheader').hasAttribute('aria-sort')).toBe(false);
  });
});

describe('Tr', () => {
  it('reports a click on the row', () => {
    const onClick = vi.fn();
    render(
      <table>
        <tbody>
          <Tr onClick={onClick} atenuada>
            <Td>Aseo</Td>
          </Tr>
        </tbody>
      </table>,
    );

    fireEvent.click(screen.getByRole('cell', { name: 'Aseo' }));

    expect(onClick).toHaveBeenCalledOnce();
    expect(screen.getByRole('row').className).toContain('opacity-50');
  });

  it('marks a row that needs attention with the warning surface, never with red', () => {
    render(
      <table>
        <tbody>
          <Tr atencion>
            <Td fija atencion>
              Sin clasificar
            </Td>
          </Tr>
        </tbody>
      </table>,
    );

    const row = screen.getByRole('row');
    expect(row.className).toContain('bg-warning-surface');
    expect(row.className).not.toContain('destructive');
    expect(screen.getByRole('cell').className).toContain('warning-surface');
  });
});

describe('TablaEsqueleto', () => {
  it('keeps the real column names while it loads, with the requested number of rows', () => {
    render(<TablaEsqueleto columnas={['Concepto', 'Fecha', 'Valor']} filas={3} divisor={false} />);

    expect(screen.getAllByRole('columnheader').map((h) => h.textContent)).toEqual([
      'Concepto',
      'Fecha',
      'Valor',
    ]);
    // One header row plus three placeholder rows.
    expect(screen.getAllByRole('row')).toHaveLength(4);
  });
});
