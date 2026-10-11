import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { exportLines, pgEnvFromUrl } from './pg-env.mjs';

describe('pg-env: a URL as the PG* variables libpq reads', () => {
  it('splits host, port, user, password and database, decoding what the URL encoded', () => {
    assert.deepEqual(
      pgEnvFromUrl(
        'postgresql://coco_app:p%40ss%27word@db.example.test:6543/postgres?sslmode=require',
      ),
      {
        PGHOST: 'db.example.test',
        PGPORT: '6543',
        PGUSER: 'coco_app',
        PGPASSWORD: "p@ss'word",
        PGDATABASE: 'postgres',
        PGSSLMODE: 'require',
      },
    );
  });

  it('defaults the port, unwraps an IPv6 host and leaves PGSSLMODE out when absent', () => {
    assert.deepEqual(pgEnvFromUrl('postgres://u:p@[::1]/coco_dev'), {
      PGHOST: '::1',
      PGPORT: '5432',
      PGUSER: 'u',
      PGPASSWORD: 'p',
      PGDATABASE: 'coco_dev',
    });
  });

  it('refuses anything that is not a postgres URL', () => {
    assert.throws(() => pgEnvFromUrl('mysql://u:p@h/db'), /not a postgres/);
    assert.throws(() => pgEnvFromUrl('not a url'));
  });

  it('prints export lines bash can eval, with single quotes escaped', () => {
    assert.equal(
      exportLines({ PGUSER: 'u', PGPASSWORD: "it's" }),
      "export PGUSER='u'\nexport PGPASSWORD='it'\\''s'",
    );
  });
});
