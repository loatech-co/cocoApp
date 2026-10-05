import { ErrorCode, OpenFeature } from '@openfeature/server-sdk';

import type { FlagName } from '@coco/flags';

import { CocoFlagProvider } from './coco-flag-provider';
import { FlagsService } from './flags.service';
import { whyTheEnvironmentIsInvalid } from '../../common/config/env';

const CANARY: FlagName = 'flags_canary';
const ANA = 7n;

let domain = 0;

/** A client over a fresh provider, through OpenFeature itself — as production runs it. */
async function clientWith(
  server: FlagName[],
  users: Record<string, Partial<Record<FlagName, boolean>>> = {},
) {
  const provider = new CocoFlagProvider(new Set(server), (userId) =>
    Promise.resolve(
      new Map(Object.entries(users[userId.toString()] ?? {})) as Map<FlagName, boolean>,
    ),
  );
  const name = `test-${(domain += 1)}`;
  await OpenFeature.setProviderAndWait(name, provider);
  return OpenFeature.getClient(name);
}

const asAna = { targetingKey: ANA.toString() };

describe('CocoFlagProvider', () => {
  it('nothing set → off', async () => {
    const client = await clientWith([]);
    expect(await client.getBooleanValue(CANARY, false, asAna)).toBe(false);
  });

  it('FEATURES turns a flag on for every user, and without a user', async () => {
    const client = await clientWith([CANARY]);
    expect(await client.getBooleanValue(CANARY, false, asAna)).toBe(true);
    expect(await client.getBooleanValue(CANARY, false, { targetingKey: '8' })).toBe(true);
    expect(await client.getBooleanValue(CANARY, false)).toBe(true);
  });

  it('feature:<name> turns a flag on for that user only', async () => {
    const client = await clientWith([], { [ANA.toString()]: { [CANARY]: true } });
    expect(await client.getBooleanValue(CANARY, false, asAna)).toBe(true);
    expect(await client.getBooleanValue(CANARY, false, { targetingKey: '8' })).toBe(false);
  });

  it("the user's own false wins over FEATURES", async () => {
    const client = await clientWith([CANARY], { [ANA.toString()]: { [CANARY]: false } });
    const details = await client.getBooleanDetails(CANARY, true, asAna);
    expect(details.value).toBe(false);
    expect(details.variant).toBe('user');
  });

  it('a name outside the registry is FLAG_NOT_FOUND and falls back to the default', async () => {
    const client = await clientWith([CANARY]);
    const details = await client.getBooleanDetails('not_registered', false, asAna);
    expect(details.value).toBe(false);
    expect(details.errorCode).toBe(ErrorCode.FLAG_NOT_FOUND);
  });

  it('flags are booleans: other types are TYPE_MISMATCH', async () => {
    const client = await clientWith([CANARY]);
    const details = await client.getStringDetails(CANARY, 'x', asAna);
    expect(details.value).toBe('x');
    expect(details.errorCode).toBe(ErrorCode.TYPE_MISMATCH);
  });

  it('a targetingKey that is not a user id is ignored, not a query', async () => {
    const lookups: bigint[] = [];
    const provider = new CocoFlagProvider(new Set(), (userId) => {
      lookups.push(userId);
      return Promise.resolve(new Map());
    });
    await provider.resolveBooleanEvaluation(CANARY, false, { targetingKey: 'anon' });
    expect(lookups).toEqual([]);
  });
});

describe('FlagsService.activeFor', () => {
  it('lists the registered flags that are on for the user', async () => {
    expect(await new FlagsService(await clientWith([CANARY])).activeFor(ANA)).toEqual([CANARY]);
    expect(await new FlagsService(await clientWith([])).activeFor(ANA)).toEqual([]);
  });
});

describe('FEATURES at boot', () => {
  const env = {
    NODE_ENV: 'test',
    DATABASE_URL: 'postgresql://coco:x@localhost:5432/coco_test',
  };

  it('is optional', () => {
    expect(whyTheEnvironmentIsInvalid(env)).toBeNull();
  });

  it('accepts registered names, spaces and the quotes LiteSpeed leaves in', () => {
    expect(whyTheEnvironmentIsInvalid({ ...env, FEATURES: `"${CANARY}, "` })).toBeNull();
  });

  it('refuses to start with a name that is not in the registry', () => {
    expect(whyTheEnvironmentIsInvalid({ ...env, FEATURES: `${CANARY},flags_canry` })).toContain(
      'FEATURES names flags that are not in packages/flags: flags_canry',
    );
  });
});
