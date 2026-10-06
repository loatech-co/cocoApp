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

describe('isInNativeApp() requires both signals', () => {
  it('a normal browser is not the app', () => {
    leaveNativeApp();
    expect(isInNativeApp()).toBe(false);
  });

  it('the User-Agent mark without a bridge is not the app', () => {
    // A UA can be faked with an extension. Without the bridge, believing it
    // would leave the normal web waiting for an app that does not exist.
    Object.defineProperty(navigator, 'userAgent', {
      value: `Mozilla/5.0 ${USER_AGENT_APP}1.0`,
      configurable: true,
    });
    expect(isInNativeApp()).toBe(false);
  });

  it('the bridge without the mark is not the app', () => {
    fakeNativeApp();
    Object.defineProperty(navigator, 'userAgent', {
      value: 'Mozilla/5.0 (iPhone)',
      configurable: true,
    });
    expect(isInNativeApp()).toBe(false);
  });

  it('both together are', () => {
    fakeNativeApp();
    expect(isInNativeApp()).toBe(true);
  });
});

describe('requestSession()', () => {
  it('resolves with what the app answers, asking for it through cocoSesion', async () => {
    const { cocoSesion } = fakeNativeApp();

    await expect(requestSession()).resolves.toEqual(APP_SESSION);
    expect(cocoSesion.postMessage).toHaveBeenCalledWith({ tipo: 'pedirSesion' });
  });

  it('fails on timeout if the app does not answer within 10 s', async () => {
    vi.useFakeTimers();
    fakeNativeApp();
    // A frozen app: the promise never resolves.
    window.webkit!.messageHandlers!.cocoSesion!.postMessage = () => new Promise(() => {});

    const promise = requestSession();
    const result = expect(promise).rejects.toMatchObject({ reason: 'tiempo' });
    await vi.advanceTimersByTimeAsync(10_000);
    await result;
  });

  it('the app without a session is a BridgeError, not just any error', async () => {
    fakeNativeApp({ failWith: 'sin sesión' });

    const error = await requestSession().catch((cause: unknown) => cause);
    expect(error).toBeInstanceOf(BridgeError);
    expect((error as BridgeError).reason).toBe('sin-sesion');
    expect((error as BridgeError).message).toBe('sin sesión');
  });

  it('an answer that is not a session is rejected', async () => {
    fakeNativeApp({ session: { hello: 'mundo' } });
    await expect(requestSession()).rejects.toMatchObject({ reason: 'respuesta' });
  });

  it('without a bridge it rejects instead of breaking', async () => {
    leaveNativeApp();
    await expect(requestSession()).rejects.toMatchObject({ reason: 'sin-puente' });
  });
});

describe('registerBridge()', () => {
  it('outside the app it installs nothing', () => {
    leaveNativeApp();
    registerBridge({ ir: () => {}, abrirBusqueda: () => {}, capturado: () => {} });
    // A normal browser does not expose a way to navigate or to inject a
    // session from outside.
    expect(window.__coco).toBeUndefined();
  });

  it('in the app it publishes window.__coco and removes it on undo', () => {
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
