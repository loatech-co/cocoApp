/**
 * Read an environment variable without trusting how whoever set it wrote it.
 *
 * ── The bug this fixes ───────────────────────────────────────────────────────
 * On the server, LiteSpeed injects the `.env` into the process EXACTLY as it
 * is written, quotes included. `SOPORTES_DIR="/home/u.../soportes-cocoapp"`
 * arrives with the quotes inside the value, and then:
 *
 *   resolve('"/home/u.../soportes-cocoapp"')
 *
 * does not start with `/`, so `resolve` treats it as RELATIVE and hangs it off
 * the working directory. The result is a folder that does not exist, inside
 * the deployed release, with the quotes in its name. `existsSync` said no for
 * all 445 receipts, the list marked them unavailable and the screen answered
 * «este soporte no está en el servidor» —true for the path being looked at,
 * and false for the file—.
 *
 * The same happened to `GHOSTSCRIPT_BIN`: `spawn` looked for an executable
 * called `"/usr/bin/gs"`, quotes and all, and no PDF got optimized.
 *
 * ── Why it is fixed here and not on the server ───────────────────────────────
 * Removing the quotes from the server's `.env` fixes it too, and it has to be
 * done. But the app would then keep breaking silently the next time someone
 * writes them —which is normal in a `.env`, and `dotenv` strips them when it
 * reads—. Here it is up to us.
 *
 * Only MATCHING quotes at both ends are stripped. A path that really carries
 * a quote in the middle stays as it is.
 */
export function readEnv(name: string, env: NodeJS.ProcessEnv = process.env): string | undefined {
  const value = readOne(name, env);
  if (value !== undefined) return value;

  const oldName = OLD_NAME_OF[name];
  return oldName === undefined ? undefined : readOne(oldName, env);
}

function readOne(name: string, env: NodeJS.ProcessEnv): string | undefined {
  const raw = env[name]?.trim();
  if (!raw) return undefined;

  const clean = stripQuotes(raw);
  return clean === '' ? undefined : clean;
}

/**
 * The variables renamed to English (step 7.2-r3): new name → old name.
 *
 * Renamed by expand and contract. The server's `.env` got the new names next
 * to the old ones, with the same values; until the old ones are removed there
 * (the contraction, step 7.10), `readEnv` asked for a new name falls back to
 * its old one, and `renamedEnvWarnings` says so in the log at boot. Then this
 * table, the fallback and the warnings go.
 *
 * Only the NAMES change: the values (`si`, the `soportes` bucket, the server
 * folder) stay as they are (ADR 0026).
 */
export const RENAMED_ENV = {
  RECEIPTS_DIR: 'SOPORTES_DIR',
  RECEIPTS_STORAGE: 'SOPORTES_STORAGE',
  RECEIPTS_BUCKET: 'SOPORTES_BUCKET',
  ALLOW_REMOTE_DATABASE: 'PERMITIR_BASE_REMOTA',
  ALLOW_DESTRUCTIVE_AUTH: 'PERMITIR_AUTH_DESTRUCTIVA',
} as const;

const OLD_NAME_OF: Partial<Record<string, string>> = RENAMED_ENV;

/**
 * What the boot log has to say about the renamed variables. Names only,
 * never values: a value can be a secret, and the log leaves the server.
 *
 *   · only the old name set        → it is read, and the warning asks for the new one
 *   · both set, different values   → the new one wins, and the warning says so
 *   · both set, same value, or only the new one, or neither → nothing to say
 */
export function renamedEnvWarnings(env: NodeJS.ProcessEnv = process.env): string[] {
  const warnings: string[] = [];
  for (const [newName, oldName] of Object.entries(RENAMED_ENV)) {
    const current = readOne(newName, env);
    const old = readOne(oldName, env);
    if (old === undefined) continue;
    if (current === undefined) {
      warnings.push(
        `${oldName} is a deprecated name: set ${newName} instead (read as ${newName} for now).`,
      );
    } else if (current !== old) {
      warnings.push(
        `${newName} and the deprecated ${oldName} have different values: ${newName} wins.`,
      );
    }
  }
  return warnings;
}

/** `"thing"` and `'thing'` are `thing`. Anything else stays the same. */
export function stripQuotes(value: string): string {
  const first = value[0];
  if ((first === '"' || first === "'") && value.length >= 2 && value.endsWith(first)) {
    return value.slice(1, -1).trim();
  }
  return value;
}

/**
 * Does `NODE_ENV` say «production»? Read the way everything else is read.
 *
 * ── This nearly took the site down ───────────────────────────────────────────
 * The check below compares `NODE_ENV` with «production», and if it fails the
 * API DOES NOT START. On the server, `NODE_ENV` comes from the environment
 * LiteSpeed injects, and that environment is uneven with quotes: of the eight
 * deployment variables, four arrive WITH them and four without. The
 * difference is how they are written in the config file —single quotes
 * arrive clean, double quotes arrive with the quote inside the value—.
 *
 * Today `NODE_ENV='production'` has single quotes and arrives clean. But that
 * is luck, not design: whoever rewrites that line with double quotes —the
 * most natural thing in a `.env`— would make the value arrive as
 * `"production"`, the comparison would fail, and the API would refuse to start
 * in production believing it is a development session.
 *
 * A variable the startup depends on cannot be read more fragilely than
 * `RECEIPTS_DIR`.
 */
export function isProduction(env: NodeJS.ProcessEnv = process.env): boolean {
  return stripQuotes((env.NODE_ENV ?? '').trim()) === 'production';
}

/** The only hosts that count as «my machine». */
const HOSTS_LOCALES = new Set(['localhost', '127.0.0.1', '::1', '0.0.0.0', 'host.docker.internal']);

/** The escape hatch, for when pointing elsewhere is deliberate. */
export const ALLOW_REMOTE_DATABASE = 'ALLOW_REMOTE_DATABASE';

/** The host of a connection URL, or `null` if it cannot be read. */
function databaseHost(url: string): string | null {
  try {
    return new URL(url).hostname || null;
  } catch {
    return null;
  }
}

/**
 * Why this API should NOT start, or `null` if it may.
 *
 * ── The accident this prevents ───────────────────────────────────────────────
 * `api/.env` pointed at the production Postgres. Any `npm run dev`, any test
 * script and any experiment wrote to the real data without anything saying
 * so. It already caused an incident: receipts uploaded locally created their
 * record in the shared database and left the file on the laptop's disk, so in
 * production they showed up as missing.
 *
 * It was nobody's mistake in particular: it was the default configuration.
 *
 * ── Why a list of LOCAL hosts and not «block Supabase» ───────────────────────
 * Because the right question is not «is this production?» but «is this my
 * machine?». Naming Supabase lets through any other remote database —a copy on
 * a server, a colleague's— that should not take writes from a development
 * session either. What is allowed is listed; everything else is refused.
 *
 * ── And why there is an escape hatch ─────────────────────────────────────────
 * Because this guards against an OVERSIGHT, not a decision. Whoever really
 * needs to point elsewhere says so out loud with `ALLOW_REMOTE_DATABASE=si`,
 * and then it is a deliberate act visible in the environment and in the log,
 * not an inherited value nobody checked.
 */
export function whyRefuseToStart(env: NodeJS.ProcessEnv = process.env): string | null {
  if (isProduction(env)) return null;
  if (readEnv(ALLOW_REMOTE_DATABASE, env)?.toLowerCase() === 'si') return null;

  const url = readEnv('DATABASE_URL', env);
  if (!url) return null; // Without a URL it fails further down, with its own message.

  const host = databaseHost(url);
  if (host === null) return null; // Unreadable: whoever uses it will complain.
  if (HOSTS_LOCALES.has(host)) return null;

  return (
    `DATABASE_URL apunta a «${host}», que no es tu máquina, y NODE_ENV no es ` +
    `«production».\n\n` +
    `La API no arranca: una sesión de desarrollo no debe escribir en una base ` +
    `remota. Apunta DATABASE_URL y DIRECT_URL al Postgres local —el mismo de ` +
    `api/.env.migrate— o, si de verdad quieres salir fuera, dilo con ` +
    `${ALLOW_REMOTE_DATABASE}=si.`
  );
}

/** The escape hatch of the lock below. */
export const ALLOW_DESTRUCTIVE_AUTH = 'ALLOW_DESTRUCTIVE_AUTH';

/**
 * Why this session may NOT touch real accounts, or `null` if it may.
 *
 * ── What this prevents ───────────────────────────────────────────────────────
 * The database is already separate, but AUTHENTICATION is not: development
 * still talks to the production Supabase Auth, because there is no other.
 * Signing in is tolerable —it writes a session row and little else—, but four
 * operations are not, because they reach real accounts from a local session:
 *
 *   · create a user             → a real account, born from a test
 *   · change a password         → locks out whoever had it
 *   · delete a user             → cannot be undone
 *   · close every session       → signs you out of the live site, on your phone
 *
 * The last one gives the rest away: trying «revoke sessions» locally would
 * sign you out in production, and nothing on screen would have said so.
 *
 * ── Why an escape hatch and not a ban ────────────────────────────────────────
 * Because the day there is a separate Supabase project for development, these
 * four stop being dangerous and are needed again —sign-up cannot be tested
 * without creating users—. That day the permission is switched on and that is
 * it; this file does not need touching again.
 */
export function whyNotTouchRealAccounts(env: NodeJS.ProcessEnv = process.env): string | null {
  if (isProduction(env)) return null;
  if (readEnv(ALLOW_DESTRUCTIVE_AUTH, env)?.toLowerCase() === 'si') return null;

  return (
    `Esta operación cambia una cuenta REAL en Supabase Auth, y NODE_ENV no es ` +
    `«production».\n\n` +
    `En desarrollo no hay un Supabase Auth aparte: lo que se toque aquí se ` +
    `toca en el proyecto del sitio publicado. Para entrar y probar la ` +
    `aplicación no hace falta —entrar sigue funcionando—; para crear, borrar o ` +
    `cambiarle la contraseña a alguien, sí. Si de verdad es lo que querés, ` +
    `dilo con ${ALLOW_DESTRUCTIVE_AUTH}=si.`
  );
}
