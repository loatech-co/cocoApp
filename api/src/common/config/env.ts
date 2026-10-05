import { z } from 'zod';

import { leerDelEntorno } from '../entorno';

/**
 * The environment the API needs, checked once at boot (step 7.4, D8).
 *
 * The API used to find out about a missing or mistyped variable when the code
 * that read it first ran: Prisma at its first query, Supabase Auth when its
 * service was built, the receipt store when the module wired it. Here every
 * variable the code reads is declared once, with its type and whether it is
 * required, and `main.ts` refuses to start with ONE message that lists every
 * problem at once.
 *
 * Values are read through `leerDelEntorno` before validating, so the quotes
 * LiteSpeed leaves inside a value on the server (`"production"`) and empty
 * strings are handled exactly as the rest of the code already handles them.
 *
 * Nothing optional became required. The conditional rules mirror what the
 * code already demanded, only earlier:
 *   · Supabase Auth's URL and keys outside `NODE_ENV=test` — the auth service
 *     is built at boot and throws without them; the e2e suite replaces it.
 *   · `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` when receipts are stored
 *     in Supabase — what `createReceiptStore` throws at boot.
 */

const optionalText = z.string().optional();

/** A URL the `URL` parser accepts, with one of the given protocols. */
function urlWith(protocols: readonly string[]): z.ZodString {
  return z.string().refine(
    (value) => {
      try {
        return protocols.includes(new URL(value).protocol);
      } catch {
        return false;
      }
    },
    { message: `must be a URL starting with ${protocols.map((p) => `${p}//`).join(' or ')}` },
  );
}

const POSTGRES_URL = urlWith(['postgresql:', 'postgres:']);
const HTTP_URL = urlWith(['https:', 'http:']);

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z
    .string()
    .regex(/^\d{1,5}$/, 'must be a port number')
    .optional(),
  LOG_LEVEL: optionalText,
  LOG_DIR: optionalText,

  DATABASE_URL: POSTGRES_URL,
  DIRECT_URL: POSTGRES_URL.optional(),
  PERMITIR_BASE_REMOTA: optionalText,

  SUPABASE_URL: HTTP_URL.optional(),
  SUPABASE_ANON_KEY: optionalText,
  SUPABASE_SERVICE_ROLE_KEY: optionalText,
  PERMITIR_AUTH_DESTRUCTIVA: optionalText,

  BOOTSTRAP_ADMIN_EMAIL: optionalText,
  CHECK_BREACHED_PASSWORDS: z.enum(['true', 'false']).optional(),
  CORS_ORIGINS: optionalText,

  SOPORTES_DIR: optionalText,
  SOPORTES_STORAGE: z.enum(['supabase', 'disk']).optional(),
  SOPORTES_BUCKET: optionalText,
  AUTO_CHARGE: optionalText,
  SPA_DIST_PATH: optionalText,
});

type CleanEnv = Partial<Record<keyof typeof envSchema.shape, string>>;

/**
 * The rules that depend on other variables. Plain code over the cleaned
 * values rather than a zod refinement: a refinement only runs when the whole
 * object is already valid, and the point is to list every problem at once.
 */
function requiredByContext(env: CleanEnv): [string, string][] {
  const problems: [string, string][] = [];
  const require = (key: keyof CleanEnv, why: string): void => {
    if (env[key] === undefined) problems.push([key, `is required ${why}`]);
  };

  const nodeEnv = env.NODE_ENV ?? 'development';
  if (nodeEnv !== 'test') {
    const why = 'outside NODE_ENV=test (Supabase Auth)';
    require('SUPABASE_URL', why);
    require('SUPABASE_ANON_KEY', why);
    require('SUPABASE_SERVICE_ROLE_KEY', why);
  }

  // The same default as `chosenStore`: Supabase in production, disk elsewhere.
  const storage = env.SOPORTES_STORAGE ?? (nodeEnv === 'production' ? 'supabase' : 'disk');
  if (storage === 'supabase') {
    const why = 'when receipts are stored in Supabase (SOPORTES_STORAGE)';
    require('SUPABASE_URL', why);
    require('SUPABASE_SERVICE_ROLE_KEY', why);
  }

  return problems;
}

/** Every variable the API reads. `api/.env.example` lists exactly these (env.spec.ts). */
export const ENV_VARIABLES = Object.keys(envSchema.shape) as (keyof typeof envSchema.shape)[];

/**
 * Why the API must NOT start with this environment, or `null` if it can.
 *
 * Same contract as `porQueNoArrancar`: `main.ts` logs the text and exits 1.
 * Every problem is listed, one per line, so one restart fixes them all.
 */
export function whyTheEnvironmentIsInvalid(source: NodeJS.ProcessEnv = process.env): string | null {
  const cleaned: CleanEnv = Object.fromEntries(
    ENV_VARIABLES.map((key) => [key, leerDelEntorno(key, source)]),
  );
  const result = envSchema.safeParse(cleaned);

  // One line per variable, even when two rules complain about the same one.
  const problems = new Map<string, string>();
  const add = (key: string, message: string): void => {
    if (!problems.has(key)) problems.set(key, `  · ${key} ${message}`);
  };
  for (const issue of result.error?.issues ?? []) {
    add(issue.path.map(String).join('.'), describe(issue));
  }
  for (const [key, message] of requiredByContext(cleaned)) add(key, message);

  if (problems.size === 0) return null;
  return (
    'The API does not start: the environment is incomplete or invalid.\n' +
    [...problems.values()].sort().join('\n') +
    '\nSee api/.env.example for what each variable is.'
  );
}

function describe(issue: z.core.$ZodIssue): string {
  if (issue.code === 'invalid_type') return 'is required';
  return issue.message;
}
