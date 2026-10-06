// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';

import { registerBridge } from '@/shared/api/native-bridge';
import { USER_AGENT_APP } from '@/shared/lib/native-contract';
import { APP_SESSION, fakeNativeApp, leaveNativeApp } from '@/test-support/fake-app';

import { BridgeError, isInNativeApp, requestSession } from './bridge';

afterEach(() => {
  leaveNativeApp();
  vi.useRealTimers();
});

describe('enLaApp() exige las dos señales', () => {
  it('un navegador normal no es la app', () => {
    leaveNativeApp();
    expect(isInNativeApp()).toBe(false);
  });

  it('la marca en el User-Agent sin puente no es la app', () => {
    // Un UA se finge con una extensión. Sin el puente, creerlo dejaría a la
    // web normal esperando a una app que no existe.
    Object.defineProperty(navigator, 'userAgent', {
      value: `Mozilla/5.0 ${USER_AGENT_APP}1.0`,
      configurable: true,
    });
    expect(isInNativeApp()).toBe(false);
  });

  it('el puente sin la marca no es la app', () => {
    fakeNativeApp();
    Object.defineProperty(navigator, 'userAgent', {
      value: 'Mozilla/5.0 (iPhone)',
      configurable: true,
    });
    expect(isInNativeApp()).toBe(false);
  });

  it('las dos juntas sí', () => {
    fakeNativeApp();
    expect(isInNativeApp()).toBe(true);
  });
});

describe('pedirSesion()', () => {
  it('resuelve con lo que contesta la app, pidiéndolo por cocoSesion', async () => {
    const { cocoSesion } = fakeNativeApp();

    await expect(requestSession()).resolves.toEqual(APP_SESSION);
    expect(cocoSesion.postMessage).toHaveBeenCalledWith({ tipo: 'pedirSesion' });
  });

  it('falla por tiempo si la app no contesta en 10 s', async () => {
    vi.useFakeTimers();
    fakeNativeApp();
    // Una app colgada: la promesa no se resuelve nunca.
    window.webkit!.messageHandlers!.cocoSesion!.postMessage = () => new Promise(() => {});

    const promise = requestSession();
    const result = expect(promise).rejects.toMatchObject({ reason: 'tiempo' });
    await vi.advanceTimersByTimeAsync(10_000);
    await result;
  });

  it('la app sin sesión es un PuenteError, no un error cualquiera', async () => {
    fakeNativeApp({ failWith: 'sin sesión' });

    const error = await requestSession().catch((cause: unknown) => cause);
    expect(error).toBeInstanceOf(BridgeError);
    expect((error as BridgeError).reason).toBe('sin-sesion');
    expect((error as BridgeError).message).toBe('sin sesión');
  });

  it('una respuesta que no es una sesión se rechaza', async () => {
    fakeNativeApp({ session: { hello: 'mundo' } });
    await expect(requestSession()).rejects.toMatchObject({ reason: 'respuesta' });
  });

  it('sin puente rechaza en vez de romper', async () => {
    leaveNativeApp();
    await expect(requestSession()).rejects.toMatchObject({ reason: 'sin-puente' });
  });
});

describe('registrarPuente()', () => {
  it('fuera de la app no instala nada', () => {
    leaveNativeApp();
    registerBridge({ ir: () => {}, abrirBusqueda: () => {}, capturado: () => {} });
    // Un navegador normal no expone una forma de navegar ni de inyectar una
    // sesión desde fuera.
    expect(window.__coco).toBeUndefined();
  });

  it('en la app publica window.__coco y lo quita al deshacer', () => {
    fakeNativeApp();
    const ir = vi.fn();
    const capturado = vi.fn();
    const remove = registerBridge({ ir, abrirBusqueda: () => {}, capturado });

    window.__coco!.ir('/cuentas');
    expect(ir).toHaveBeenCalledWith('/cuentas');
    window.__coco!.capturado();
    expect(capturado).toHaveBeenCalledOnce();
    expect(typeof window.__coco!.primerPlano).toBe('function');
    expect(typeof window.__coco!.recibirSesion).toBe('function');
    expect(typeof window.__coco!.sesionCerrada).toBe('function');

    remove();
    expect(window.__coco).toBeUndefined();
  });
});
