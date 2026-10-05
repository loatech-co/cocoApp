import { whyTheEnvironmentIsInvalid } from './env';

/** What `.github/workflows/ci.yml` writes into `api/.env.test`. */
const CI_TEST_ENV = {
  NODE_ENV: 'test',
  DATABASE_URL: 'postgresql://coco_migrate:ci-only-password@localhost:5432/coco_test',
  DIRECT_URL: 'postgresql://coco_migrate:ci-only-password@localhost:5432/coco_test',
  CORS_ORIGINS: 'http://localhost:5173',
  LOG_LEVEL: 'silent',
  JWT_SECRET: 'ci-only-jwt-secret-at-least-32-characters-long',
  CHECK_BREACHED_PASSWORDS: 'false',
  BOOTSTRAP_ADMIN_EMAIL: 'admin-e2e@pruebas.coco',
  SOPORTES_DIR: '.soportes-test',
};

const SUPABASE = {
  SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_ANON_KEY: 'anon',
  SUPABASE_SERVICE_ROLE_KEY: 'service',
};

/** The shape of the local `api/.env`. */
const LOCAL_ENV = {
  NODE_ENV: 'development',
  PORT: '3000',
  LOG_LEVEL: 'debug',
  DATABASE_URL: 'postgresql://coco:x@localhost:5432/coco',
  DIRECT_URL: 'postgresql://coco:x@localhost:5432/coco',
  ...SUPABASE,
  SOPORTES_DIR: '"/Users/someone/VS Code/soportes"',
  PERMITIR_AUTH_DESTRUCTIVA: 'si',
};

describe('whyTheEnvironmentIsInvalid', () => {
  describe('valid environments', () => {
    it('accepts the test environment CI writes', () => {
      expect(whyTheEnvironmentIsInvalid(CI_TEST_ENV)).toBeNull();
    });

    it('accepts the local development environment', () => {
      expect(whyTheEnvironmentIsInvalid(LOCAL_ENV)).toBeNull();
    });

    it('accepts the server environment, with the quotes LiteSpeed leaves in', () => {
      expect(
        whyTheEnvironmentIsInvalid({
          NODE_ENV: '"production"',
          DATABASE_URL: '"postgresql://u:p@db.example.com:6543/postgres?pgbouncer=true"',
          SUPABASE_URL: "'https://example.supabase.co'",
          SUPABASE_ANON_KEY: '"anon"',
          SUPABASE_SERVICE_ROLE_KEY: '"service"',
          CORS_ORIGINS: 'https://example.com',
        }),
      ).toBeNull();
    });

    it('treats an empty value as absent, not as invalid', () => {
      expect(whyTheEnvironmentIsInvalid({ ...CI_TEST_ENV, PORT: '', SOPORTES_STORAGE: ' ' })).toBe(
        null,
      );
    });
  });

  describe('missing variables', () => {
    it('refuses to start without DATABASE_URL', () => {
      const { DATABASE_URL: _omitted, ...rest } = CI_TEST_ENV;

      expect(whyTheEnvironmentIsInvalid(rest)).toContain('DATABASE_URL is required');
    });

    it('requires Supabase Auth outside the test environment', () => {
      const message = whyTheEnvironmentIsInvalid({ ...CI_TEST_ENV, NODE_ENV: 'development' });

      expect(message).toContain('SUPABASE_URL is required');
      expect(message).toContain('SUPABASE_ANON_KEY is required');
      expect(message).toContain('SUPABASE_SERVICE_ROLE_KEY is required');
    });

    it('requires the service key when receipts go to Supabase Storage', () => {
      expect(
        whyTheEnvironmentIsInvalid({
          ...CI_TEST_ENV,
          SOPORTES_STORAGE: 'supabase',
          SUPABASE_URL: 'https://example.supabase.co',
        }),
      ).toContain('SUPABASE_SERVICE_ROLE_KEY is required when receipts are stored in Supabase');
    });

    it('lists every problem at once, one line each', () => {
      const message = whyTheEnvironmentIsInvalid({ NODE_ENV: 'production' }) ?? '';

      expect(message.split('\n').filter((line) => line.startsWith('  · '))).toEqual([
        '  · DATABASE_URL is required',
        '  · SUPABASE_ANON_KEY is required outside NODE_ENV=test (Supabase Auth)',
        '  · SUPABASE_SERVICE_ROLE_KEY is required outside NODE_ENV=test (Supabase Auth)',
        '  · SUPABASE_URL is required outside NODE_ENV=test (Supabase Auth)',
      ]);
    });
  });

  describe('invalid values', () => {
    it('rejects a database URL that is not Postgres', () => {
      expect(
        whyTheEnvironmentIsInvalid({ ...CI_TEST_ENV, DATABASE_URL: 'mysql://u:p@localhost/coco' }),
      ).toContain('DATABASE_URL must be a URL starting with postgresql:// or postgres://');
    });

    it('rejects an unknown NODE_ENV', () => {
      expect(whyTheEnvironmentIsInvalid({ ...CI_TEST_ENV, NODE_ENV: 'staging' })).toContain(
        'NODE_ENV',
      );
    });

    it('rejects a port that is not a number', () => {
      expect(whyTheEnvironmentIsInvalid({ ...CI_TEST_ENV, PORT: 'http' })).toContain(
        'PORT must be a port number',
      );
    });

    it('rejects a storage that does not exist', () => {
      expect(whyTheEnvironmentIsInvalid({ ...CI_TEST_ENV, SOPORTES_STORAGE: 's3' })).toContain(
        'SOPORTES_STORAGE',
      );
    });
  });
});
