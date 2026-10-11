// Keeps, out of the GRANT/REVOKE statements of a dump, the ones the target
// database can take: a grantee that exists there, or PUBLIC. The rest is
// reported, not applied (restore.sh explains why: the backup holds every
// privilege of production, and a local Postgres has no `service_role`).
//
// Usage: pg_restore -L <acl list> -f - db.dump |
//          node scripts/restore/filter-privileges.mjs --roles a,b,c | psql …
//
// Reads SQL on stdin, writes the filtered SQL on stdout and a one-line
// summary on stderr. Exits 1 if --roles is missing.

import { createInterface } from 'node:readline';

// `GRANT … TO "some role";` and `REVOKE … FROM PUBLIC;` on ONE line each: that
// is how pg_dump writes them. Anything else goes through untouched.
const GRANTEE =
  /^(?:GRANT|REVOKE)\s.*\s(?:TO|FROM)\s+("(?:[^"]|"")+"|[^\s;]+)(?:\s+WITH GRANT OPTION)?\s*;$/;

export function unquote(name) {
  return name.startsWith('"') ? name.slice(1, -1).replace(/""/g, '"') : name;
}

/** Decides one line: `{ keep: true }`, or `{ keep: false, role }`. */
export function judge(line, roles) {
  const match = GRANTEE.exec(line.trim());
  if (!match) return { keep: true };
  const role = unquote(match[1]);
  if (role === 'PUBLIC' || roles.has(role)) return { keep: true };
  return { keep: false, role };
}

export async function filter(input, output, roles) {
  const skipped = new Map();
  let applied = 0;
  for await (const line of createInterface({ input, crlfDelay: Infinity })) {
    const verdict = judge(line, roles);
    if (verdict.keep) {
      if (/^(GRANT|REVOKE)\s/.test(line)) applied += 1;
      output.write(`${line}\n`);
    } else {
      skipped.set(verdict.role, (skipped.get(verdict.role) ?? 0) + 1);
    }
  }
  return { applied, skipped };
}

const isMain = process.argv[1]?.endsWith('filter-privileges.mjs');
if (isMain) {
  const at = process.argv.indexOf('--roles');
  const list = at === -1 ? undefined : process.argv[at + 1];
  if (!list) {
    console.error('Usage: filter-privileges.mjs --roles <role,role,…>');
    process.exit(1);
  }
  const roles = new Set(list.split(',').filter(Boolean));
  const { applied, skipped } = await filter(process.stdin, process.stdout, roles);
  const missing = [...skipped].map(([role, n]) => `${role} (${n})`).join(', ');
  console.error(
    `   privileges: ${applied} statements applied` +
      (skipped.size ? `; skipped for roles missing here: ${missing}` : ''),
  );
}
