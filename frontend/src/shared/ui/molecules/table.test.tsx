// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { Table, TableSkeleton, TableFooter, Td, Th, Tr } from './table';

afterEach(cleanup);

describe('Table', () => {
  it('renders a real table with column headers, rows and a footer', () => {
    render(
      <Table>
        <thead>
          <tr>
            <Th isSticky>Concepto</Th>
            <Th align="right">Valor</Th>
          </tr>
        </thead>
        <tbody>
          <Tr>
            <Td isSticky>Aseo</Td>
            <Td align="right">x</Td>
          </Tr>
        </tbody>
        <TableFooter>
          <tr>
            <Td>Total</Td>
            <Td />
          </tr>
        </TableFooter>
      </Table>,
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
  ] as const)('announces the %s order with aria-sort', (direction, aria) => {
    render(
      <table>
        <thead>
          <tr>
            <Th align="right" sort={{ direction, onChange: vi.fn() }}>
              Valor
            </Th>
          </tr>
        </thead>
      </table>,
    );

    expect(screen.getByRole('columnheader').getAttribute('aria-sort')).toBe(aria);
  });

  it('sorts through a button inside the header', () => {
    const onChange = vi.fn();
    render(
      <table>
        <thead>
          <tr>
            <Th sort={{ direction: null, onChange }}>Fecha</Th>
          </tr>
        </thead>
      </table>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Fecha' }));

    expect(onChange).toHaveBeenCalledOnce();
    expect(screen.getByRole('columnheader').hasAttribute('aria-sort')).toBe(false);
  });
});

describe('Tr', () => {
  it('reports a click on the row', () => {
    const onClick = vi.fn();
    render(
      <table>
        <tbody>
          <Tr onClick={onClick} isDimmed>
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
          <Tr isFlagged>
            <Td isSticky isFlagged>
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

describe('TableSkeleton', () => {
  it('keeps the real column names while it loads, with the requested number of rows', () => {
    render(<TableSkeleton columns={['Concepto', 'Fecha', 'Valor']} rows={3} hasDivider={false} />);

    expect(screen.getAllByRole('columnheader').map((h) => h.textContent)).toEqual([
      'Concepto',
      'Fecha',
      'Valor',
    ]);
    // One header row plus three placeholder rows.
    expect(screen.getAllByRole('row')).toHaveLength(4);
  });
});
