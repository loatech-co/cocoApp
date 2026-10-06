// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';

import { SESION_DE_LA_APP, fingirLaApp, salirDeLaApp } from '@/pruebas/app-falsa';
import { registrarPuente } from '@/shared/api/native-bridge';
import { USER_AGENT_APP } from '@/shared/lib/native-contract';

import { PuenteError, enLaApp, pedirSesion } from './puente-nativo';

afterEach(() => {
  salirDeLaApp();
  vi.useRealTimers();
});

describe('enLaApp() exige las dos señales', () => {
  it('un navegador normal no es la app', () => {
    salirDeLaApp();
    expect(enLaApp()).toBe(false);
  });

  it('la marca en el User-Agent sin puente no es la app', () => {
    // Un UA se finge con una extensión. Sin el puente, creerlo dejaría a la
    // web normal esperando a una app que no existe.
    Object.defineProperty(navigator, 'userAgent', {
      value: `Mozilla/5.0 ${USER_AGENT_APP}1.0`,
      configurable: true,
    });
    expect(enLaApp()).toBe(false);
  });

  it('el puente sin la marca no es la app', () => {
    fingirLaApp();
    Object.defineProperty(navigator, 'userAgent', {
      value: 'Mozilla/5.0 (iPhone)',
      configurable: true,
    });
    expect(enLaApp()).toBe(false);
  });

  it('las dos juntas sí', () => {
    fingirLaApp();
    expect(enLaApp()).toBe(true);
  });
});

describe('pedirSesion()', () => {
  it('resuelve con lo que contesta la app, pidiéndolo por cocoSesion', async () => {
    const { cocoSesion } = fingirLaApp();

    await expect(pedirSesion()).resolves.toEqual(SESION_DE_LA_APP);
    expect(cocoSesion.postMessage).toHaveBeenCalledWith({ tipo: 'pedirSesion' });
  });

  it('falla por tiempo si la app no contesta en 10 s', async () => {
    vi.useFakeTimers();
    fingirLaApp();
    // Una app colgada: la promesa no se resuelve nunca.
    window.webkit!.messageHandlers!.cocoSesion!.postMessage = () => new Promise(() => {});

    const promesa = pedirSesion();
    const resultado = expect(promesa).rejects.toMatchObject({ motivo: 'tiempo' });
    await vi.advanceTimersByTimeAsync(10_000);
    await resultado;
  });

  it('la app sin sesión es un PuenteError, no un error cualquiera', async () => {
    fingirLaApp({ falla: 'sin sesión' });

    const error = await pedirSesion().catch((causa: unknown) => causa);
    expect(error).toBeInstanceOf(PuenteError);
    expect((error as PuenteError).motivo).toBe('sin-sesion');
    expect((error as PuenteError).message).toBe('sin sesión');
  });

  it('una respuesta que no es una sesión se rechaza', async () => {
    fingirLaApp({ sesion: { hola: 'mundo' } });
    await expect(pedirSesion()).rejects.toMatchObject({ motivo: 'respuesta' });
  });

  it('sin puente rechaza en vez de romper', async () => {
    salirDeLaApp();
    await expect(pedirSesion()).rejects.toMatchObject({ motivo: 'sin-puente' });
  });
});

describe('registrarPuente()', () => {
  it('fuera de la app no instala nada', () => {
    salirDeLaApp();
    registrarPuente({ ir: () => {}, abrirBusqueda: () => {}, capturado: () => {} });
    // Un navegador normal no expone una forma de navegar ni de inyectar una
    // sesión desde fuera.
    expect(window.__coco).toBeUndefined();
  });

  it('en la app publica window.__coco y lo quita al deshacer', () => {
    fingirLaApp();
    const ir = vi.fn();
    const capturado = vi.fn();
    const quitar = registrarPuente({ ir, abrirBusqueda: () => {}, capturado });

    window.__coco!.ir('/cuentas');
    expect(ir).toHaveBeenCalledWith('/cuentas');
    window.__coco!.capturado();
    expect(capturado).toHaveBeenCalledOnce();
    expect(typeof window.__coco!.primerPlano).toBe('function');
    expect(typeof window.__coco!.recibirSesion).toBe('function');
    expect(typeof window.__coco!.sesionCerrada).toBe('function');

    quitar();
    expect(window.__coco).toBeUndefined();
  });
});
