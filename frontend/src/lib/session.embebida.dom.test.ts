// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  cambiarContrasena,
  descartarSesion,
  estadoActual,
  recibirSesion,
  renovar,
  salir,
  salirDeTodosLosDispositivos,
  sesionCerrada,
  tokenActual,
} from './session';
import { SESION_DE_LA_APP, fingirLaApp, salirDeLaApp } from '@/pruebas/app-falsa';

/**
 * La sesión DENTRO de la app del teléfono.
 *
 * Lo que se comprueba es la frontera: qué va a la red y qué va por el puente.
 * La web embebida no tiene refresh token, así que ninguna de estas llamadas
 * puede acabar en `/auth/refresh` ni en `/auth/logout`; y de lo que se le
 * cuenta a la app depende su llavero, así que importa tanto lo que se avisa
 * como lo que NO.
 */

function fetchQueContesta(status: number) {
  return vi.fn(() =>
    Promise.resolve({
      status,
      ok: status < 400,
      json: () => Promise.resolve({ data: SESION_DE_LA_APP }),
    } as unknown as Response),
  );
}

/** Las rutas de `/auth` a las que se llamó por la red, sin la base (que viene del `.env`). */
function rutasLlamadas(fetchFalso: ReturnType<typeof fetchQueContesta>): string[] {
  return fetchFalso.mock.calls.map((llamada) =>
    String((llamada as unknown[])[0]).replace(/^.*\/auth\//, '/auth/'),
  );
}

beforeEach(() => {
  vi.useFakeTimers();
  descartarSesion();
});

afterEach(() => {
  salirDeLaApp();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('Con puente', () => {
  it('renovar() no toca /auth/refresh y guarda lo que contesta la app', async () => {
    const red = fetchQueContesta(200);
    vi.stubGlobal('fetch', red);
    const { cocoSesion } = fingirLaApp();

    await expect(renovar()).resolves.toBe(true);

    expect(red).not.toHaveBeenCalled();
    expect(cocoSesion.postMessage).toHaveBeenCalledWith({ tipo: 'pedirSesion' });
    expect(tokenActual()).toBe('token-de-la-app');
    expect(estadoActual().usuario?.email).toBe('g@coco.app');
    expect(estadoActual().cargando).toBe(false);
  });

  it('dos renovar() a la vez son UN solo mensaje a la app', async () => {
    const { cocoSesion } = fingirLaApp();

    await Promise.all([renovar(), renovar()]);

    // La app rota el refresh en cada uso y GoTrue detecta reusos: dos
    // peticiones a la vez matarían la familia. Por eso comparten promesa.
    expect(cocoSesion.postMessage).toHaveBeenCalledTimes(1);
  });

  it('si el puente falla, limpia la memoria y NO avisa a la app', async () => {
    const { cocoEventos } = fingirLaApp({ falla: 'sin red' });

    await expect(renovar()).resolves.toBe(false);

    expect(tokenActual()).toBeNull();
    expect(estadoActual().cargando).toBe(false);
    // Un fallo de red del puente nunca tira el llavero.
    expect(cocoEventos.postMessage).not.toHaveBeenCalled();
  });

  it('salir() avisa «salir» y no llama a /auth/logout', async () => {
    const red = fetchQueContesta(204);
    vi.stubGlobal('fetch', red);
    const { cocoEventos } = fingirLaApp();
    await renovar();

    await salir();

    expect(cocoEventos.postMessage).toHaveBeenCalledWith({ tipo: 'salir' });
    expect(red).not.toHaveBeenCalled();
    expect(tokenActual()).toBeNull();
  });

  it('cambiarContrasena() avisa «sesionCerrada»', async () => {
    vi.stubGlobal('fetch', fetchQueContesta(204));
    const { cocoEventos } = fingirLaApp();
    await renovar();

    await cambiarContrasena('vieja', 'nueva');

    expect(cocoEventos.postMessage).toHaveBeenCalledWith({ tipo: 'sesionCerrada' });
    expect(tokenActual()).toBeNull();
  });

  it('salirDeTodosLosDispositivos() avisa «sesionCerrada»', async () => {
    vi.stubGlobal('fetch', fetchQueContesta(204));
    const { cocoEventos } = fingirLaApp();
    await renovar();

    await salirDeTodosLosDispositivos();

    expect(cocoEventos.postMessage).toHaveBeenCalledWith({ tipo: 'sesionCerrada' });
    expect(tokenActual()).toBeNull();
  });

  it('descartarSesion() NO avisa', async () => {
    const { cocoEventos } = fingirLaApp();
    await renovar();

    descartarSesion();

    expect(tokenActual()).toBeNull();
    expect(cocoEventos.postMessage).not.toHaveBeenCalled();
  });

  it('recibirSesion() restaura y sesionCerrada() limpia', () => {
    fingirLaApp();

    recibirSesion(SESION_DE_LA_APP);
    expect(tokenActual()).toBe('token-de-la-app');
    expect(estadoActual().usuario?.display_name).toBe('Gerardo');

    sesionCerrada();
    expect(tokenActual()).toBeNull();
    expect(estadoActual().usuario).toBeNull();
  });
});

describe('Sin puente', () => {
  it('renovar() sigue yendo por la red, con la cookie', async () => {
    const red = fetchQueContesta(200);
    vi.stubGlobal('fetch', red);
    salirDeLaApp();

    await expect(renovar()).resolves.toBe(true);

    expect(rutasLlamadas(red)).toEqual(['/auth/refresh']);
    expect((red.mock.calls[0] as unknown[])[1]).toMatchObject({ credentials: 'include' });
  });

  it('salir() llama a /auth/logout', async () => {
    const red = fetchQueContesta(204);
    vi.stubGlobal('fetch', red);
    salirDeLaApp();

    await salir();

    expect(rutasLlamadas(red)).toEqual(['/auth/logout']);
  });
});
