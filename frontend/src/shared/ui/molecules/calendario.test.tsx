// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { rangoLargo } from '@/shared/lib/format';

import { Calendario, celdasDelMes } from './calendario';

afterEach(cleanup);

describe('La rejilla del calendario', () => {
  it('empieza en lunes: septiembre de 2026 arranca un martes y deja un hueco', () => {
    const celdas = celdasDelMes(2026, 8);
    // El 1 de septiembre de 2026 es martes: una sola casilla vacía delante.
    expect(celdas.slice(0, 3)).toEqual([null, '2026-09-01', '2026-09-02']);
  });

  it('no pierde ni inventa días: los 30 de septiembre están todos', () => {
    const dias = celdasDelMes(2026, 8).filter((c): c is string => c !== null);
    expect(dias).toHaveLength(30);
    expect(dias.at(-1)).toBe('2026-09-30');
  });

  it('cuando el mes empieza en lunes no deja hueco delante', () => {
    // 1 de junio de 2026, lunes.
    expect(celdasDelMes(2026, 5)[0]).toBe('2026-06-01');
  });

  it('cuando el mes empieza en domingo el hueco es de SEIS casillas', () => {
    // Con la semana en domingo este sería el caso sin hueco; aquí es el mayor.
    // 1 de febrero de 2026, domingo.
    const celdas = celdasDelMes(2026, 1);
    expect(celdas.slice(0, 7)).toEqual([null, null, null, null, null, null, '2026-02-01']);
  });

  it('completa la última fila para que la rejilla sea rectangular', () => {
    // Una fila a medias desalinearía la banda del rango contra el borde.
    expect(celdasDelMes(2026, 8).length % 7).toBe(0);
  });

  it('respeta los años bisiestos', () => {
    const dias = celdasDelMes(2024, 1).filter((c) => c !== null);
    expect(dias).toHaveLength(29);
  });
});

describe('El rango escrito', () => {
  it('con mes y año completos, y sin repetirlos cuando son los mismos', () => {
    expect(rangoLargo('2026-09-01', '2026-09-10')).toBe('1 — 10 de septiembre de 2026');
  });

  it('repite el mes cuando cambia, pero el año solo una vez', () => {
    expect(rangoLargo('2026-08-20', '2026-09-10')).toBe('20 de agosto — 10 de septiembre de 2026');
  });

  it('escribe los dos años cuando el rango cruza de uno a otro', () => {
    expect(rangoLargo('2025-12-20', '2026-01-05')).toBe(
      '20 de diciembre de 2025 — 5 de enero de 2026',
    );
  });
});

describe('Calendario', () => {
  const monthShown = (): string | null =>
    document.querySelector('[aria-live="polite"]')?.textContent ?? null;

  it('opens on the month of the first end and announces it politely', () => {
    render(<Calendario desde="2026-09-10" onDia={vi.fn()} />);

    expect(monthShown()).toBe('septiembre de 2026');
  });

  it('names every day in full for assistive tech and reports the one pressed', () => {
    const onDia = vi.fn();
    render(<Calendario desde="2026-09-10" onDia={onDia} />);

    fireEvent.click(screen.getByRole('button', { name: '15 de septiembre de 2026' }));

    expect(onDia).toHaveBeenCalledWith('2026-09-15');
  });

  it('marks one end as pressed when it paints a single day', () => {
    render(<Calendario desde="2026-09-10" hasta="2026-09-10" onDia={vi.fn()} />);

    const pressed = screen.getAllByRole('button', { pressed: true });
    expect(pressed.map((b) => b.getAttribute('aria-label'))).toEqual(['10 de septiembre de 2026']);
  });

  it('marks both ends of a range as pressed and shades the days between with the accent', () => {
    render(<Calendario desde="2026-09-10" hasta="2026-09-12" onDia={vi.fn()} />);

    expect(screen.getAllByRole('button', { pressed: true })).toHaveLength(2);
    const middle = screen.getByRole('button', { name: '11 de septiembre de 2026' });
    expect(middle.getAttribute('aria-pressed')).toBe('false');
    expect(middle.parentElement!.className).toContain('bg-accent');
  });

  it('moves between months on its own, across the year boundary', () => {
    render(<Calendario hasta="2026-01-05" onDia={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: 'Mes anterior' }));
    expect(monthShown()).toBe('diciembre de 2025');

    fireEvent.click(screen.getByRole('button', { name: 'Mes siguiente' }));
    fireEvent.click(screen.getByRole('button', { name: 'Mes siguiente' }));
    expect(monthShown()).toBe('febrero de 2026');
  });

  it('lets the caller own the visible month', () => {
    const onVista = vi.fn();
    render(<Calendario vista={{ anio: 2026, mes: 11 }} onVista={onVista} onDia={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: 'Mes siguiente' }));

    expect(onVista).toHaveBeenCalledWith({ anio: 2027, mes: 0 });
    expect(monthShown()).toBe('diciembre de 2026');
  });

  it('reports the day under the pointer and clears it on leaving the grid', () => {
    const onSobrevolar = vi.fn();
    render(<Calendario desde="2026-09-10" onDia={vi.fn()} onSobrevolar={onSobrevolar} />);

    const day = screen.getByRole('button', { name: '20 de septiembre de 2026' });
    fireEvent.mouseEnter(day);
    fireEvent.mouseLeave(day.parentElement!.parentElement!);

    expect(onSobrevolar.mock.calls).toEqual([['2026-09-20'], [null]]);
  });

  it('opens on the current month when it has no dates', () => {
    render(<Calendario onDia={vi.fn()} />);

    expect(monthShown()).toMatch(/ de \d{4}$/);
  });
});
