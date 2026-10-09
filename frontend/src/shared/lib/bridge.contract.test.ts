// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, expectTypeOf, it, vi } from 'vitest';

import { registerBridge } from '@/shared/api/native-bridge';
import { APP_SESSION, leaveNativeApp } from '@/test-support/fake-app';

import { isInNativeApp, notifyApp, requestSession } from './bridge';
import { USER_AGENT_APP, type BridgeEvent } from './native-contract';

/*
  The web half of the bridge, checked against the iOS half.

  Both halves are read from the repo: the Swift sources name the handlers, the
  events the app understands and what it calls on `window.__coco`. A name that
  changes on one side only fails here (and in `ContractsTests.swift`, which
  reads this side from iOS).
*/

const webFolder = join(import.meta.dirname, '../../../../ios/Coco/Features/Web');
const bridgeSwift = readFileSync(join(webFolder, 'WebBridge.swift'), 'utf8');
const noticeSwift = readFileSync(join(webFolder, 'WebNotice.swift'), 'utf8');

function handler(name: 'sessionHandler' | 'eventsHandler'): string {
  const match = new RegExp(`static let ${name} = "([A-Za-z]+)"`).exec(bridgeSwift);
  if (!match?.[1]) throw new Error(`WebBridge.swift has no ${name}`);
  return match[1];
}

/** The `case` names of a Swift enum, in order. */
function swiftCases(source: string, header: string): string[] {
  const start = source.indexOf(header);
  if (start < 0) throw new Error(`no ${header}`);
  const body = source.slice(start, source.indexOf('\n}', start));
  return [...body.matchAll(/^ {4}case ([A-Za-z]+)$/gm)].map((match) => match[1]!);
}

/** Every event the web sends. The type check below keeps it complete. */
const WEB_EVENTS = ['signOut', 'sessionClosed', 'noSession', 'openCapture'] as const;

afterEach(() => leaveNativeApp());

describe('the bridge names match the iOS app', () => {
  it('the web talks to the two handlers the app registers', async () => {
    const session = { postMessage: vi.fn(() => Promise.resolve(APP_SESSION)) };
    const events = { postMessage: vi.fn() };
    Object.defineProperty(navigator, 'userAgent', {
      value: `Mozilla/5.0 (iPhone) ${USER_AGENT_APP}0.1.0`,
      configurable: true,
    });
    window.webkit = {
      messageHandlers: { [handler('sessionHandler')]: session, [handler('eventsHandler')]: events },
    };

    expect(isInNativeApp()).toBe(true);
    await expect(requestSession()).resolves.toEqual(APP_SESSION);
    notifyApp({ type: 'noSession' });
    expect(events.postMessage).toHaveBeenCalledWith({ type: 'noSession' });
  });

  it('the app understands every event the web sends', () => {
    expectTypeOf<(typeof WEB_EVENTS)[number]>().toEqualTypeOf<BridgeEvent['type']>();
    expect(swiftCases(bridgeSwift, 'enum WebEvent:').sort()).toEqual([...WEB_EVENTS].sort());
  });

  it('window.__coco has exactly what the app calls', () => {
    Object.defineProperty(navigator, 'userAgent', {
      value: `Mozilla/5.0 (iPhone) ${USER_AGENT_APP}0.1.0`,
      configurable: true,
    });
    window.webkit = {
      messageHandlers: { cocoSession: { postMessage: () => Promise.resolve(APP_SESSION) } },
    };
    const remove = registerBridge({ navigate: () => {}, openSearch: () => {}, captured: () => {} });

    const called = [
      ...swiftCases(bridgeSwift, 'enum WebFunction:'),
      ...swiftCases(noticeSwift, 'enum WebNotice:'),
    ];
    expect(Object.keys(window.__coco!).sort()).toEqual(called.sort());
    remove();
  });
});
