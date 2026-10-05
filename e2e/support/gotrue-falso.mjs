// @ts-check
import { SignJWT, exportJWK, generateKeyPair } from 'jose';
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';

/**
 * A local stand-in for Supabase Auth (GoTrue), for the Playwright journeys.
 *
 * The API is started UNCHANGED and pointed at this server through
 * `SUPABASE_URL`, so the journeys run the real `SupabaseAuthService`: its HTTP
 * calls, and the ES256 signature check against a JWKS. Nothing leaves
 * 127.0.0.1, and no account is ever created in a real Supabase project.
 *
 * Only the routes the API calls are implemented. Unlike real GoTrue, a refresh
 * token is NOT burnt when used: every journey restores its session from the
 * same cookie, and rotation is already covered by the API's own e2e suite.
 *
 * @param {{ port: number }} options
 * @returns {Promise<{ url: string, close: () => Promise<void> }>}
 */
export async function startFakeGoTrue({ port }) {
  const { privateKey, publicKey } = await generateKeyPair('ES256');
  const jwk = { ...(await exportJWK(publicKey)), kid: 'e2e', alg: 'ES256', use: 'sig' };
  const issuer = `http://127.0.0.1:${port}/auth/v1`;

  /** @type {Map<string, { email: string, password: string }>} */
  const accounts = new Map();
  /** @type {Map<string, string>} refresh token → auth id */
  const refreshTokens = new Map();

  /** @param {string} authId */
  async function session(authId) {
    const account = accounts.get(authId);
    if (!account) return null;
    const accessToken = await new SignJWT({ email: account.email, role: 'authenticated' })
      .setProtectedHeader({ alg: 'ES256', kid: 'e2e' })
      .setSubject(authId)
      .setIssuer(issuer)
      .setAudience('authenticated')
      .setIssuedAt()
      .setExpirationTime('1h')
      .sign(privateKey);
    const refreshToken = `refresh-${randomUUID()}`;
    refreshTokens.set(refreshToken, authId);
    return {
      access_token: accessToken,
      refresh_token: refreshToken,
      expires_in: 3600,
      token_type: 'bearer',
      user: { id: authId, email: account.email },
    };
  }

  /**
   * @param {string} method
   * @param {URL} url
   * @param {Record<string, unknown>} body
   * @returns {Promise<[number, unknown]>}
   */
  async function route(method, url, body) {
    const path = url.pathname.replace(/^\/auth\/v1/, '');

    if (method === 'GET' && path === '/.well-known/jwks.json') return [200, { keys: [jwk] }];

    if (method === 'POST' && path === '/token') {
      const grant = url.searchParams.get('grant_type');
      if (grant === 'password') {
        const found = [...accounts.entries()].find(([, a]) => a.email === body.email);
        if (!found || found[1].password !== body.password) {
          return [400, { error: 'invalid_grant', error_description: 'Invalid login credentials' }];
        }
        return [200, await session(found[0])];
      }
      if (grant === 'refresh_token') {
        const authId = refreshTokens.get(String(body.refresh_token));
        const reply = authId ? await session(authId) : null;
        return reply ? [200, reply] : [400, { error: 'invalid_grant' }];
      }
      return [400, { error: 'unsupported_grant_type' }];
    }

    if (method === 'POST' && path === '/logout') return [204, null];

    if (method === 'POST' && path === '/admin/users') {
      const email = String(body.email);
      if ([...accounts.values()].some((a) => a.email === email)) {
        return [
          422,
          {
            code: 'email_exists',
            msg: 'A user with this email address has already been registered',
          },
        ];
      }
      const id = randomUUID();
      accounts.set(id, { email, password: String(body.password) });
      return [200, { id, email }];
    }

    const admin = /^\/admin\/users\/([^/]+)(\/logout)?$/.exec(path);
    if (admin) {
      const [, id = '', logout] = admin;
      if (logout && method === 'POST') {
        for (const [token, owner] of refreshTokens) if (owner === id) refreshTokens.delete(token);
        return [204, null];
      }
      const account = accounts.get(id);
      if (method === 'PUT' && account) {
        accounts.set(id, { ...account, password: String(body.password ?? account.password) });
        return [200, { id, email: account.email }];
      }
      if (method === 'DELETE') {
        accounts.delete(id);
        return [200, {}];
      }
    }

    return [404, { msg: `not implemented in the fake: ${method} ${path}` }];
  }

  const server = createServer((req, res) => {
    let raw = '';
    req.on('data', (chunk) => (raw += String(chunk)));
    req.on('end', () => {
      const url = new URL(req.url ?? '/', issuer);
      const body = parseBody(raw);
      route(req.method ?? 'GET', url, body).then(
        ([status, payload]) => {
          res.statusCode = status;
          res.setHeader('Content-Type', 'application/json');
          res.end(payload === null ? '' : JSON.stringify(payload));
        },
        (/** @type {unknown} */ error) => {
          res.statusCode = 500;
          res.end(JSON.stringify({ msg: String(error) }));
        },
      );
    });
  });

  await new Promise((resolve) => server.listen(port, '127.0.0.1', () => resolve(undefined)));

  return {
    url: `http://127.0.0.1:${port}`,
    close: () => new Promise((resolve) => server.close(() => resolve(undefined))),
  };
}

/**
 * @param {string} raw
 * @returns {Record<string, unknown>}
 */
function parseBody(raw) {
  try {
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}
