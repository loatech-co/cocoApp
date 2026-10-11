import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { PassThrough } from 'node:stream';

import { filter, judge, unquote } from './filter-privileges.mjs';

const roles = new Set(['coco_app', 'coco_migrate']);

describe('the privilege filter of restore.sh', () => {
  it('keeps grants to roles the target has, and every REVOKE from PUBLIC', () => {
    assert.deepEqual(judge('GRANT SELECT,INSERT ON TABLE public.audit_log TO coco_app;', roles), {
      keep: true,
    });
    assert.deepEqual(judge('REVOKE ALL ON SCHEMA app_private FROM PUBLIC;', roles), {
      keep: true,
    });
    assert.deepEqual(
      judge('GRANT UPDATE(last_login_at,updated_at) ON TABLE public.users TO coco_app;', roles),
      { keep: true },
    );
  });

  it('drops grants and revokes for roles the target does not have', () => {
    assert.deepEqual(judge('GRANT ALL ON TABLE public.users TO service_role;', roles), {
      keep: false,
      role: 'service_role',
    });
    assert.deepEqual(judge('REVOKE ALL ON TABLE public.users FROM anon;', roles), {
      keep: false,
      role: 'anon',
    });
    assert.deepEqual(judge('GRANT ALL ON TABLE public.t TO "odd role" WITH GRANT OPTION;', roles), {
      keep: false,
      role: 'odd role',
    });
  });

  it('leaves everything that is not a GRANT or REVOKE alone', () => {
    assert.deepEqual(judge('SET row_security = off;', roles), { keep: true });
    assert.deepEqual(judge('-- Name: users; Type: ACL', roles), { keep: true });
    assert.deepEqual(judge('', roles), { keep: true });
  });

  it('unquotes identifiers', () => {
    assert.equal(unquote('"a ""b"""'), 'a "b"');
    assert.equal(unquote('plain'), 'plain');
  });

  it('streams the kept lines and counts the rest by role', async () => {
    const input = new PassThrough();
    const output = new PassThrough();
    input.end(
      [
        'SET client_encoding = UTF8;',
        'GRANT SELECT ON TABLE public.a TO coco_app;',
        'GRANT ALL ON TABLE public.a TO service_role;',
        'GRANT ALL ON TABLE public.b TO service_role;',
        'REVOKE ALL ON FUNCTION app_private.f() FROM PUBLIC;',
      ].join('\n'),
    );
    const summary = await filter(input, output, roles);
    output.end();
    assert.equal(
      output.read().toString(),
      'SET client_encoding = UTF8;\nGRANT SELECT ON TABLE public.a TO coco_app;\nREVOKE ALL ON FUNCTION app_private.f() FROM PUBLIC;\n',
    );
    assert.deepEqual(summary, { applied: 2, skipped: new Map([['service_role', 2]]) });
  });
});
