// Turns a Postgres URL into the PG* variables libpq reads, so pg_dump, psql
// and pg_restore can be called WITHOUT the URL on their command line: argv is
// visible in `ps` to every process on the machine, and the URL carries the
// password. The URL itself is read from the environment, never from argv.
//
// Usage, from bash:
//   eval "$(node scripts/db/pg-env.mjs ADMIN_DATABASE_URL)"   # then: psql -c …
//
// It prints one `export NAME='value'` per variable, single-quoted for bash.
// PGDATABASE with a URI would not do: libpq does not expand it there.

/** The PG* variables of a URL, as an object; `sslmode` becomes PGSSLMODE. */
export function pgEnvFromUrl(url) {
  const u = new URL(url);
  if (u.protocol !== 'postgresql:' && u.protocol !== 'postgres:') {
    throw new Error('not a postgres:// URL');
  }
  const vars = {
    PGHOST: u.hostname.replace(/^\[|\]$/g, ''),
    PGPORT: u.port || '5432',
    PGUSER: decodeURIComponent(u.username),
    PGPASSWORD: decodeURIComponent(u.password),
    PGDATABASE: decodeURIComponent(u.pathname.slice(1)),
  };
  const ssl = u.searchParams.get('sslmode');
  if (ssl) vars.PGSSLMODE = ssl;
  return vars;
}

/** `export K='v'` lines bash can eval; a single quote in a value is closed, escaped and reopened. */
export function exportLines(vars) {
  const quoted = (s) => `'${s.replace(/'/g, "'\\''")}'`;
  return Object.entries(vars)
    .map(([k, v]) => `export ${k}=${quoted(v)}`)
    .join('\n');
}

const isMain = process.argv[1]?.endsWith('pg-env.mjs');
if (isMain) {
  const name = process.argv[2];
  const url = name ? process.env[name] : undefined;
  if (!url) {
    console.error('Usage: pg-env.mjs <NAME of the environment variable that holds the URL>');
    process.exit(1);
  }
  console.log(exportLines(pgEnvFromUrl(url)));
}
