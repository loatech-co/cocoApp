import { ConfigService } from '@nestjs/config';
import { SignJWT, exportJWK, generateKeyPair, type JWK } from 'jose';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';

import { PERMISO_DE_AUTH_DESTRUCTIVA } from '../src/common/env';
import { SupabaseAuthService } from '../src/modules/auth/supabase-auth.service';

/**
 * The Supabase Auth client against a local stand-in for GoTrue.
 *
 * The rest of the suite swaps this service for an in-memory double, so this
 * is the only place its own code runs: the HTTP calls, how each status is
 * read, and the JWT check against a real JWKS. Nothing leaves 127.0.0.1.
 */

interface Reply {
  status: number;
  body?: unknown;
  raw?: string;
}

interface Call {
  method: string;
  url: string;
  auth: string | undefined;
  body: unknown;
}

describe('SupabaseAuthService (against a local GoTrue)', () => {
  let server: Server;
  let url: string;
  let replies: Record<string, Reply>;
  let calls: Call[];
  let jwk: JWK;
  let privateKey: CryptoKey;
  let service: SupabaseAuthService;

  const session = {
    access_token: 'access',
    refresh_token: 'refresh',
    expires_in: 900,
    user: { id: 'auth-1', email: 'ana@pruebas.coco' },
  };

  beforeAll(async () => {
    const keys = await generateKeyPair('ES256');
    privateKey = keys.privateKey;
    jwk = { ...(await exportJWK(keys.publicKey)), kid: 'k1', alg: 'ES256' };

    server = createServer((req: IncomingMessage, res: ServerResponse) => {
      let raw = '';
      req.on('data', (chunk: Buffer) => (raw += chunk.toString()));
      req.on('end', () => {
        const path = (req.url ?? '').replace('/auth/v1', '');
        if (path === '/.well-known/jwks.json') {
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ keys: [jwk] }));
          return;
        }
        calls.push({
          method: req.method ?? '',
          url: path,
          auth: req.headers.authorization,
          body: raw ? JSON.parse(raw) : undefined,
        });
        const reply = replies[`${req.method} ${path}`] ?? { status: 200, body: {} };
        res.statusCode = reply.status;
        res.end(reply.raw ?? (reply.body === undefined ? '' : JSON.stringify(reply.body)));
      });
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/`;

    const config = new ConfigService({
      SUPABASE_URL: url,
      SUPABASE_ANON_KEY: 'anon',
      SUPABASE_SERVICE_ROLE_KEY: 'service',
    });
    service = new SupabaseAuthService(config);
  });

  afterAll(async () => {
    await new Promise((resolve) => server.close(resolve));
  });

  beforeEach(() => {
    replies = {};
    calls = [];
    process.env[PERMISO_DE_AUTH_DESTRUCTIVA] = 'si';
  });

  afterEach(() => {
    Reflect.deleteProperty(process.env, PERMISO_DE_AUTH_DESTRUCTIVA);
  });

  const token = (claims: Record<string, unknown>, issuer = `${url}auth/v1`) =>
    new SignJWT(claims)
      .setProtectedHeader({ alg: 'ES256', kid: 'k1' })
      .setIssuer(issuer)
      .setAudience('authenticated')
      .setIssuedAt()
      .setExpirationTime('5m')
      .sign(privateKey);

  it('refuses to start without its configuration', () => {
    expect(() => new SupabaseAuthService(new ConfigService({ SUPABASE_URL: ' ' }))).toThrow(
      /Falta SUPABASE_URL/,
    );
  });

  describe('verificarAccessToken', () => {
    it('accepts a token signed by the project and returns its subject', async () => {
      const result = await service.verificarAccessToken(
        await token({ sub: 'auth-1', email: 'ana@pruebas.coco' }),
      );
      expect(result).toMatchObject({ authId: 'auth-1', email: 'ana@pruebas.coco' });
      expect(result.iatMs % 1000).toBe(0);
    });

    it('returns an empty email when the token carries none', async () => {
      const result = await service.verificarAccessToken(await token({ sub: 'auth-1' }));
      expect(result.email).toBe('');
    });

    it.each([
      ['without a subject', () => token({})],
      ['from another issuer', () => token({ sub: 'x' }, 'https://otro.example/auth/v1')],
      ['that is not a JWT', () => Promise.resolve('basura')],
    ])('rejects a token %s', async (_, make) => {
      await expect(service.verificarAccessToken(await make())).rejects.toThrow(
        'Token inválido o expirado.',
      );
    });
  });

  describe('sessions', () => {
    it('opens a session with the password grant and the anon key', async () => {
      replies['POST /token?grant_type=password'] = { status: 200, body: session };

      const result = await service.entrar('ana@pruebas.coco', 'secreta');

      expect(result).toEqual({
        accessToken: 'access',
        refreshToken: 'refresh',
        expiresIn: 900,
        authId: 'auth-1',
        email: 'ana@pruebas.coco',
      });
      expect(calls[0]).toMatchObject({
        auth: 'Bearer anon',
        body: { email: 'ana@pruebas.coco', password: 'secreta' },
      });
    });

    it('reads 400 and 401 as wrong credentials, not as a failure', async () => {
      replies['POST /token?grant_type=password'] = { status: 400, body: { msg: 'invalid' } };
      replies['POST /token?grant_type=refresh_token'] = { status: 401 };
      expect(await service.entrar('a@b.co', 'x')).toBeNull();
      expect(await service.refrescar('r')).toBeNull();
    });

    it('fails loudly on a session without tokens, and defaults what is optional', async () => {
      replies['POST /token?grant_type=refresh_token'] = { status: 200, raw: 'no es json' };
      await expect(service.refrescar('r')).rejects.toThrow('No se pudo abrir la sesión.');

      replies['POST /token?grant_type=refresh_token'] = {
        status: 200,
        body: { ...session, expires_in: undefined, user: { id: 'auth-1' } },
      };
      expect(await service.refrescar('r')).toMatchObject({ expiresIn: 3600, email: '' });
    });

    it('closes its own session with the session token', async () => {
      replies['POST /token?grant_type=refresh_token'] = { status: 200, body: session };
      await service.cerrarSesion('refresh');
      expect(calls.map((c) => c.url)).toEqual([
        '/token?grant_type=refresh_token',
        '/logout?scope=local',
      ]);
      expect(calls[1]?.auth).toBe('Bearer access');
    });

    it('does nothing to close a session that is already dead', async () => {
      replies['POST /token?grant_type=refresh_token'] = { status: 401 };
      await service.cerrarSesion('muerto');
      expect(calls).toHaveLength(1);
    });

    it('checks a password by opening and closing a throwaway session', async () => {
      replies['POST /token?grant_type=password'] = { status: 200, body: session };
      expect(await service.contrasenaEsCorrecta('a@b.co', 'bien')).toBe(true);
      expect(calls.map((c) => c.url)).toContain('/logout?scope=local');

      replies['POST /token?grant_type=password'] = { status: 400 };
      expect(await service.contrasenaEsCorrecta('a@b.co', 'mal')).toBe(false);
    });
  });

  describe('administration', () => {
    it('creates a confirmed user with the service key and returns its id', async () => {
      replies['POST /admin/users'] = { status: 200, body: { id: 'auth-9' } };
      expect(await service.crearUsuario('n@pruebas.coco', 'pw')).toBe('auth-9');
      expect(calls[0]).toMatchObject({
        auth: 'Bearer service',
        body: { email: 'n@pruebas.coco', password: 'pw', email_confirm: true },
      });
    });

    it('returns null for an email that already exists', async () => {
      replies['POST /admin/users'] = { status: 422, body: { error_code: 'email_exists' } };
      expect(await service.crearUsuario('n@pruebas.coco', 'pw')).toBeNull();
    });

    it('fails on any other error, or on a reply without an id', async () => {
      replies['POST /admin/users'] = { status: 422, body: { msg: 'weak password' } };
      await expect(service.crearUsuario('n@pruebas.coco', 'pw')).rejects.toThrow(
        'No se pudo crear el usuario.',
      );
      replies['POST /admin/users'] = { status: 200, body: { message: { otro: 1 } } };
      await expect(service.crearUsuario('n@pruebas.coco', 'pw')).rejects.toThrow(
        'No se pudo crear el usuario.',
      );
    });

    it('changes a password, signs a user out everywhere and deletes it', async () => {
      await service.cambiarContrasena('auth-1', 'nueva');
      await service.cerrarTodasLasSesiones('auth-1');
      await service.eliminarUsuario('auth-1');
      expect(calls.map((c) => `${c.method} ${c.url}`)).toEqual([
        'PUT /admin/users/auth-1',
        'POST /admin/users/auth-1/logout',
        'DELETE /admin/users/auth-1',
      ]);

      replies['PUT /admin/users/auth-1'] = { status: 500 };
      await expect(service.cambiarContrasena('auth-1', 'nueva')).rejects.toThrow(
        'No se pudo cambiar la contraseña.',
      );
    });

    it('blocks every admin call outside production unless allowed, before the network', async () => {
      Reflect.deleteProperty(process.env, PERMISO_DE_AUTH_DESTRUCTIVA);
      await expect(service.eliminarUsuario('auth-1')).rejects.toThrow(/cuenta REAL/);
      expect(calls).toEqual([]);
    });
  });

  it('reports the identity service as unavailable when it does not answer', async () => {
    const offline = new SupabaseAuthService(
      new ConfigService({
        SUPABASE_URL: 'http://127.0.0.1:1',
        SUPABASE_ANON_KEY: 'anon',
        SUPABASE_SERVICE_ROLE_KEY: 'service',
      }),
    );
    await expect(offline.entrar('a@b.co', 'x')).rejects.toThrow(
      'El servicio de identidad no está disponible.',
    );
  });
});
