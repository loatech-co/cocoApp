import {
  ALLOW_DESTRUCTIVE_AUTH,
  ALLOW_REMOTE_DATABASE,
  isProduction,
  readEnv,
  RENAMED_ENV,
  renamedEnvWarnings,
  whyRefuseToStart,
  whyNotTouchRealAccounts,
  stripQuotes,
} from './env';

/**
 * An environment variable with quotes inside its value.
 *
 * Not hypothetical: it is the bug that left the 445 receipts marked «no está
 * en el servidor» for an afternoon. LiteSpeed injects the `.env` exactly as
 * written, so `SOPORTES_DIR="/home/…"` arrives WITH the quotes, the path no
 * longer starts with `/` and `resolve` hangs it off the working directory.
 * The resulting folder does not exist and everything shows as unavailable.
 */
describe('Reading from the environment', () => {
  const original = { ...process.env };
  afterEach(() => {
    process.env = { ...original };
  });

  it('strips the double quotes around the value', () => {
    process.env.PRUEBA = '"/home/u523998927/soportes-cocoapp"';
    expect(readEnv('PRUEBA')).toBe('/home/u523998927/soportes-cocoapp');
  });

  it('and the single ones', () => {
    process.env.PRUEBA = "'/usr/bin/gs'";
    expect(readEnv('PRUEBA')).toBe('/usr/bin/gs');
  });

  it('leaves a plain value alone', () => {
    process.env.PRUEBA = '/home/u523998927/soportes-cocoapp';
    expect(readEnv('PRUEBA')).toBe('/home/u523998927/soportes-cocoapp');
  });

  it('does not touch quotes that do NOT wrap the value', () => {
    // Only matching quotes at both ends go: a path that really carries a
    // quote in the middle stays as it is.
    expect(stripQuotes('/ruta/con"comilla/dentro')).toBe('/ruta/con"comilla/dentro');
    expect(stripQuotes('"sin cerrar')).toBe('"sin cerrar');
    expect(stripQuotes('"mezcladas\'')).toBe('"mezcladas\'');
  });

  it('an empty value is the same as no value', () => {
    // So the reader can use `??` and fall back to its default: empty quotes
    // in the `.env` should not point at the root.
    process.env.PRUEBA = '""';
    expect(readEnv('PRUEBA')).toBeUndefined();

    process.env.PRUEBA = '   ';
    expect(readEnv('PRUEBA')).toBeUndefined();

    delete process.env.PRUEBA;
    expect(readEnv('PRUEBA')).toBeUndefined();
  });

  it('trims the space on both sides of the quotes', () => {
    process.env.PRUEBA = '  " /usr/bin/gs "  ';
    expect(readEnv('PRUEBA')).toBe('/usr/bin/gs');
  });
});

/**
 * A development session must not be able to write to a remote database.
 *
 * `api/.env` pointed at the production Postgres, so any `npm run dev` wrote
 * to the real data without anything saying so. It was nobody's mistake: it
 * was the default.
 */
describe('Refusing to start against a database that is not mine', () => {
  const local = {
    NODE_ENV: 'development',
    DATABASE_URL: 'postgresql://u:p@localhost:5432/coco_dev',
  };
  const remote = {
    NODE_ENV: 'development',
    DATABASE_URL: 'postgresql://u:p@aws-0-us-east-1.pooler.supabase.com:5432/postgres',
  };

  it('lets the local database through', () => {
    expect(whyRefuseToStart(local)).toBeNull();
    expect(
      whyRefuseToStart({ ...local, DATABASE_URL: 'postgresql://u:p@127.0.0.1:5432/x' }),
    ).toBeNull();
  });

  it('stops any remote host, not just Supabase', () => {
    // The question is not «is this production?» but «is this my machine?».
    expect(whyRefuseToStart(remote)).toContain('no es tu máquina');
    expect(
      whyRefuseToStart({ ...local, DATABASE_URL: 'postgresql://u:p@db.ejemplo.com:5432/x' }),
    ).toContain('no es tu máquina');
  });

  it('stays out of production', () => {
    expect(whyRefuseToStart({ ...remote, NODE_ENV: 'production' })).toBeNull();
  });

  it('can point elsewhere, but only by saying so out loud', () => {
    expect(whyRefuseToStart({ ...remote, [ALLOW_REMOTE_DATABASE]: 'si' })).toBeNull();
    // Nothing else counts: the permission is explicit or it is not.
    expect(whyRefuseToStart({ ...remote, [ALLOW_REMOTE_DATABASE]: 'true' })).not.toBeNull();
  });

  it('the message says what to do, not just no', () => {
    const message = whyRefuseToStart(remote) ?? '';
    expect(message).toContain('api/.env.migrate');
    expect(message).toContain(ALLOW_REMOTE_DATABASE);
  });

  it('without DATABASE_URL it is none of its business', () => {
    // The variable is missing: whoever needs it complains, with its own error.
    expect(whyRefuseToStart({ NODE_ENV: 'development' })).toBeNull();
  });
});

/**
 * `NODE_ENV` decides whether the API starts, so it is read with the same care
 * as everything else.
 */
describe('Knowing whether this is production', () => {
  it('recognises the clean value', () => {
    expect(isProduction({ NODE_ENV: 'production' })).toBe(true);
    expect(isProduction({ NODE_ENV: '  production  ' })).toBe(true);
  });

  it('and the quoted one, which is how half the server environment arrives', () => {
    // Of the eight deployment variables, four arrive with the quotes inside
    // the value. That NODE_ENV is not one of them today is luck.
    expect(isProduction({ NODE_ENV: '"production"' })).toBe(true);
    expect(isProduction({ NODE_ENV: "'production'" })).toBe(true);
  });

  it('is not fooled by anything else', () => {
    expect(isProduction({ NODE_ENV: 'development' })).toBe(false);
    expect(isProduction({ NODE_ENV: 'produccion' })).toBe(false);
    expect(isProduction({})).toBe(false);
  });

  it('and a quoted NODE_ENV does NOT stop production from starting', () => {
    // The test that really matters: this is the deployment going down.
    const server = {
      NODE_ENV: '"production"',
      DATABASE_URL: 'postgresql://u:p@aws-0-us-east-1.pooler.supabase.com:5432/postgres',
    };
    expect(whyRefuseToStart(server)).toBeNull();
  });
});

/**
 * The real-accounts lock.
 *
 * The database is already separate; authentication is not, because there is
 * no development Supabase Auth. Signing in is tolerated. Creating, deleting,
 * changing the password and closing every session are not.
 */
describe('Not touching real accounts from a local session', () => {
  it('stays out of production', () => {
    expect(whyNotTouchRealAccounts({ NODE_ENV: 'production' })).toBeNull();
  });

  it('outside production, it refuses', () => {
    expect(whyNotTouchRealAccounts({ NODE_ENV: 'development' })).toContain('cuenta REAL');
  });

  it('and says that signing in still works', () => {
    // Without it, the message would read as «authentication is broken».
    expect(whyNotTouchRealAccounts({})).toContain('entrar sigue funcionando');
  });

  it('can be lifted, by saying so out loud', () => {
    expect(
      whyNotTouchRealAccounts({ NODE_ENV: 'development', [ALLOW_DESTRUCTIVE_AUTH]: 'si' }),
    ).toBeNull();
    expect(
      whyNotTouchRealAccounts({
        NODE_ENV: 'development',
        [ALLOW_DESTRUCTIVE_AUTH]: 'true',
      }),
    ).not.toBeNull();
  });
});

/**
 * The variables renamed to English (step 7.2-r3), by expand and contract:
 * until the server loses the old names, a new name falls back to its old one.
 */
describe('Variables renamed to English', () => {
  const secret = 'value-that-must-not-reach-the-log';
  // The old names through the table, so they appear in one place only.
  const OLD_BUCKET = RENAMED_ENV.RECEIPTS_BUCKET;

  it('neither name set: nothing to read and nothing to say', () => {
    expect(readEnv('RECEIPTS_BUCKET', {})).toBeUndefined();
    expect(renamedEnvWarnings({})).toEqual([]);
  });

  it('only the new name: read, and no warning', () => {
    const env = { RECEIPTS_BUCKET: secret };
    expect(readEnv('RECEIPTS_BUCKET', env)).toBe(secret);
    expect(renamedEnvWarnings(env)).toEqual([]);
  });

  it('only the old name: read under the new one, with a warning that names it', () => {
    const env = { [OLD_BUCKET]: `"${secret}"` };
    expect(readEnv('RECEIPTS_BUCKET', env)).toBe(secret);

    const warnings = renamedEnvWarnings(env);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain(OLD_BUCKET);
    expect(warnings[0]).toContain('RECEIPTS_BUCKET');
    expect(warnings[0]).not.toContain(secret);
  });

  it('both, with the same value (the server after the expansion): no warning', () => {
    const env = { RECEIPTS_BUCKET: secret, [OLD_BUCKET]: `'${secret}'` };
    expect(readEnv('RECEIPTS_BUCKET', env)).toBe(secret);
    expect(renamedEnvWarnings(env)).toEqual([]);
  });

  it('both, with different values: the new one wins, and the warning says so without either value', () => {
    const env = { RECEIPTS_BUCKET: secret, [OLD_BUCKET]: 'old-value' };
    expect(readEnv('RECEIPTS_BUCKET', env)).toBe(secret);

    const warnings = renamedEnvWarnings(env);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('RECEIPTS_BUCKET wins');
    expect(warnings[0]).not.toContain(secret);
    expect(warnings[0]).not.toContain('old-value');
  });

  it('an empty new name counts as unset, so the old one is read', () => {
    expect(readEnv('RECEIPTS_DIR', { RECEIPTS_DIR: ' ', [RENAMED_ENV.RECEIPTS_DIR]: '/x' })).toBe(
      '/x',
    );
  });

  it('covers the five renamed variables, and only names that are not read elsewhere', () => {
    expect(RENAMED_ENV).toEqual({
      RECEIPTS_DIR: 'SOPORTES_DIR',
      RECEIPTS_STORAGE: 'SOPORTES_STORAGE',
      RECEIPTS_BUCKET: 'SOPORTES_BUCKET',
      ALLOW_REMOTE_DATABASE: 'PERMITIR_BASE_REMOTA',
      ALLOW_DESTRUCTIVE_AUTH: 'PERMITIR_AUTH_DESTRUCTIVA',
    });
    const env = Object.fromEntries(Object.values(RENAMED_ENV).map((old) => [old, 'x']));
    expect(renamedEnvWarnings(env)).toHaveLength(5);
  });

  it('the escape hatches still open under their old names', () => {
    const remote = {
      NODE_ENV: 'development',
      DATABASE_URL: 'postgresql://u:p@db.example.com:5432/postgres',
    };
    expect(whyRefuseToStart({ ...remote, [RENAMED_ENV.ALLOW_REMOTE_DATABASE]: 'si' })).toBeNull();
    expect(
      whyNotTouchRealAccounts({
        NODE_ENV: 'development',
        [RENAMED_ENV.ALLOW_DESTRUCTIVE_AUTH]: 'si',
      }),
    ).toBeNull();
  });
});
