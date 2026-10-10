import { isDeepStrictEqual } from 'node:util';
import request from 'supertest';

import {
  NEW_PASSWORD,
  VALID_PASSWORD,
  testEmail,
  startApp,
  type TestEnvironment,
} from './helpers/app';

/**
 * Our own auth — end to end, faking nothing.
 *
 * Every test here maps to a specific control: if one fails, there is a real
 * hole, not a matter of style.
 */
describe('Our own auth (e2e)', () => {
  let env: TestEnvironment;
  let http: ReturnType<typeof request>;

  /** The same value as in `.env.test`: whoever signs up with it is born admin and active. */
  const INITIAL_ADMIN_EMAIL = 'admin-e2e@pruebas.coco';

  beforeAll(async () => {
    env = await startApp();
    http = request(env.app.getHttpServer());
  });

  afterAll(async () => {
    await env.close();
  });

  beforeEach(async () => {
    await env.clean();
  });

  const register = (body: Record<string, unknown> = {}) =>
    http.post('/api/v2/auth/register').send({
      email: testEmail(),
      password: VALID_PASSWORD,
      displayName: 'Persona de Prueba',
      ...body,
    });

  const signIn = (email: string, password: string) =>
    http.post('/api/v2/auth/login').send({ email, password });

  /** Pulls the refresh cookie out of a login/refresh response. */
  const cookieOf = (response: request.Response): string => {
    const cookies = response.headers['set-cookie'] as unknown as string[] | undefined;
    const cookie = cookies?.find((c) => c.startsWith('coco_refresh='));
    if (!cookie) throw new Error('La respuesta no trajo cookie de refresh.');
    return cookie.split(';')[0]!;
  };

  // ── Sign-up ────────────────────────────────────────────────────────────────

  describe('Sign-up', () => {
    it('creates the account as pending, never active', async () => {
      const email = testEmail();
      const response = await register({ email }).expect(201);

      expect(response.body.data.pendingApproval).toBe(true);

      const user = await env.prisma.user.findUniqueOrThrow({ where: { email } });
      expect(user.status).toBe('pending');
      expect(user.role).toBe('user');
      // The credential lives in Supabase, not here: this table is the PROFILE.
      // What must be there is the link to the Supabase account, because without
      // it the person could never sign in.
      expect(user.authId).not.toBeNull();
    });

    it('rejects a weak password saying EXACTLY what it lacks', async () => {
      const response = await register({ password: 'abcdefghijkl' }).expect(422);

      expect(response.body.code).toBe('weak_password');
      const messages = response.body.errors.map((d: { message: string }) => d.message);
      expect(messages).toEqual(
        expect.arrayContaining([
          'Debe incluir al menos una letra mayúscula.',
          'Debe incluir al menos un número.',
          'Debe incluir al menos un símbolo (por ejemplo: ! @ # $ % & *).',
        ]),
      );
    });

    it('rejects a password derived from the email', async () => {
      await register({ email: 'mariana@pruebas.coco', password: 'Mariana-2026!' }).expect(422);
    });

    it('creates nothing if the password fails the policy', async () => {
      const email = testEmail();
      await register({ email, password: 'corta1!' }).expect(400);
      expect(await env.prisma.user.count({ where: { email } })).toBe(0);
    });

    // ── Anti-enumeration ──
    it('answers IDENTICALLY for an email that already exists, and creates no second row', async () => {
      const email = testEmail();

      const first = await register({ email }).expect(201);
      const second = await register({ email, password: NEW_PASSWORD }).expect(201);

      // Byte for byte the same: if they differed, the endpoint would be an oracle
      // for finding out which emails have an account.
      expect(second.body).toEqual(first.body);
      expect(await env.prisma.user.count({ where: { email } })).toBe(1);

      // And the original password is still the right one: the second sign-up did
      // not overwrite anything.
      const user = await env.prisma.user.findUniqueOrThrow({ where: { email } });
      await env.prisma.user.update({
        where: { id: user.id },
        data: { status: 'active' },
      });
      await signIn(email, VALID_PASSWORD).expect(200);
      await signIn(email, NEW_PASSWORD).expect(401);
    });

    it('normalises the email: case and spaces do not create different accounts', async () => {
      const email = testEmail();

      await register({ email }).expect(201);
      await register({ email: `  ${email.toUpperCase()}  ` }).expect(201);

      expect(await env.prisma.user.count()).toBe(1);
    });

    // ── Initial admin ──
    it('the BOOTSTRAP_ADMIN_EMAIL address is born admin and active', async () => {
      await register({ email: INITIAL_ADMIN_EMAIL }).expect(201);

      const admin = await env.prisma.user.findUniqueOrThrow({
        where: { email: INITIAL_ADMIN_EMAIL },
      });
      expect(admin.role).toBe('admin');
      expect(admin.status).toBe('active');
      expect(admin.approvedAt).not.toBeNull();
      // Its tree is seeded as itself under row-level security: a failed seed
      // is only logged, so this is the one place it would show (ADR 0019).
      expect(await env.prisma.category.count({ where: { userId: admin.id } })).toBeGreaterThan(0);
    });

    it('the FIRST sign-up does NOT take the panel unless it is the configured email', async () => {
      // If it were "first one wins", anyone who reached a freshly deployed app
      // before its owner would take over the administration.
      await register().expect(201);
      expect(await env.prisma.user.count({ where: { role: 'admin' } })).toBe(0);
    });

    it('with an admin already there, the BOOTSTRAP_ADMIN_EMAIL address signs up pending', async () => {
      // The database would refuse a second admin (ADR 0027): the app asks
      // first, so the credential and the profile are both created.
      await env.createUser({ role: 'admin', status: 'suspended' });

      const response = await register({ email: INITIAL_ADMIN_EMAIL }).expect(201);

      expect(response.body.data).toMatchObject({ pendingApproval: true });
      expect(
        await env.prisma.user.findUniqueOrThrow({
          where: { email: INITIAL_ADMIN_EMAIL },
          select: { role: true, status: true, approvedAt: true },
        }),
      ).toEqual({ role: 'user', status: 'pending', approvedAt: null });
      expect(await env.prisma.user.count({ where: { role: 'admin' } })).toBe(1);
      expect(env.supabase.hasAccount(INITIAL_ADMIN_EMAIL)).toBe(true);
    });

    it('a profile that cannot be created leaves no credential behind in Supabase', async () => {
      // A legacy row (no auth_id) holds the email, so the INSERT of the
      // profile fails after Supabase created the credential.
      const email = testEmail();
      await env.prisma.user.create({ data: { email } });
      expect(env.supabase.hasAccount(email)).toBe(false);

      const response = await register({ email });

      expect(response.status).toBeGreaterThanOrEqual(400);
      expect(env.supabase.hasAccount(email)).toBe(false);
      expect(await env.prisma.user.count({ where: { email } })).toBe(1);
    });
  });

  // ── Login ──────────────────────────────────────────────────────────────────

  describe('Login', () => {
    it('returns the access token in the body and the refresh token ONLY in an httpOnly cookie', async () => {
      const user = await env.createUser();

      const response = await signIn(user.email, VALID_PASSWORD).expect(200);

      expect(response.body.data.accessToken).toEqual(expect.any(String));
      expect(response.body.data.expiresIn).toBe(15 * 60);
      expect(response.body.data.user.email).toBe(user.email);

      // The refresh token appears nowhere in the body.
      expect(JSON.stringify(response.body)).not.toMatch(/refresh/i);

      const cookies = response.headers['set-cookie'] as unknown as string[];
      const cookie = cookies.find((c) => c.startsWith('coco_refresh='))!;
      expect(cookie).toContain('HttpOnly'); // not even an XSS can read it
      expect(cookie).toContain('SameSite=Strict'); // neutralises CSRF here
      expect(cookie).toContain('Path=/api/v2/auth'); // does not travel on every call
    });

    it('with a wrong password it answers EXACTLY the same as with an unknown email', async () => {
      const user = await env.createUser();

      const withAccount = await signIn(user.email, 'Zz9$Otra-Cosa-Aqui!').expect(401);
      const withoutAccount = await signIn('nadie@pruebas.coco', 'Zz9$Otra-Cosa-Aqui!').expect(401);

      expect(withAccount.body).toEqual(withoutAccount.body);
    });

    it('a pending account cannot sign in, even with the right password', async () => {
      const user = await env.createUser({ status: 'pending' });

      const response = await signIn(user.email, VALID_PASSWORD).expect(403);
      expect(response.body.detail).toMatch(/pendiente de aprobación/i);
    });

    it('a suspended account cannot sign in', async () => {
      const user = await env.createUser({ status: 'suspended' });

      const response = await signIn(user.email, VALID_PASSWORD).expect(403);
      expect(response.body.detail).toMatch(/suspendida/i);
    });

    it('the account status is revealed only to whoever got the password right', async () => {
      // The other way round —checking the status before the password— anyone
      // could find out which emails have an account and what state they are in.
      const user = await env.createUser({ status: 'pending' });

      const response = await signIn(user.email, 'Zz9$Otra-Cosa-Aqui!').expect(401);
      expect(response.body.detail).not.toMatch(/pendiente|suspendida/i);
    });
  });

  // ── Rotation and reuse detection ───────────────────────────────────────────

  // ROTATION and reuse detection of refresh tokens moved to Supabase with the
  // migration: this code no longer implements them, so testing them here
  // would be testing someone else's library. What is tested is what is still
  // ours: that there is no way in without the cookie, and that a suspended
  // account cannot stretch its session by trading one token for another.
  // ROTATION and reuse detection moved to Supabase with the migration: this
  // code no longer implements them, so testing them here would be testing
  // someone else's library. What is left is what is still ours: that there is
  // no way in without the cookie, and that a suspended account cannot stretch
  // its session by trading one token for another.
  describe('Refresh token', () => {
    it('without a cookie it answers 401', async () => {
      await http.post('/api/v2/auth/refresh').expect(401);
    });

    // ── The most important control in the whole module ──

    it('the refresh token of a suspended account does not work', async () => {
      const user = await env.createUser();
      const login = await signIn(user.email, VALID_PASSWORD).expect(200);

      await env.prisma.user.update({
        where: { id: user.id },
        data: { status: 'suspended' },
      });

      await http.post('/api/v2/auth/refresh').set('Cookie', cookieOf(login)).expect(401);
    });
  });

  // ── Immediate revocation ───────────────────────────────────────────────────

  describe('Immediate revocation', () => {
    it('logout-all invalidates access tokens already issued, without waiting for them to expire', async () => {
      const user = await env.createUser();
      const header = env.as(user);

      await http.get('/api/v2/auth/me').set('Authorization', header).expect(200);

      await http.post('/api/v2/auth/logout-all').set('Authorization', header).expect(204);

      // The token is still cryptographically valid and unexpired. What kills it
      // is `sessionsValidFrom`, which the guard compares on every request.
      await http.get('/api/v2/auth/me').set('Authorization', header).expect(401);
    });

    it('suspending an account instantly throws out whoever was already inside', async () => {
      const user = await env.createUser();
      const header = env.as(user);

      await http.get('/api/v2/auth/me').set('Authorization', header).expect(200);

      await env.prisma.user.update({
        where: { id: user.id },
        data: { status: 'suspended' },
      });

      await http.get('/api/v2/auth/me').set('Authorization', header).expect(403);
    });

    it('the role comes from the DATABASE, not from the token', async () => {
      const user = await env.createUser({ role: 'user' });
      const header = env.as(user);

      await http.get('/api/v2/admin/users').set('Authorization', header).expect(403);

      // Promoted from outside, without issuing a new token: if the role came
      // from the token, this would keep returning 403 until it expired.
      await env.prisma.user.update({
        where: { id: user.id },
        data: { role: 'admin' },
      });

      await http.get('/api/v2/admin/users').set('Authorization', header).expect(200);
    });
  });

  // ── Password change ────────────────────────────────────────────────────────

  describe('Password change', () => {
    it('requires the current password', async () => {
      const user = await env.createUser();

      // If the access token were enough, whoever stole one would take over the account.
      await http
        .post('/api/v2/auth/change-password')
        .set('Authorization', env.as(user))
        .send({ currentPassword: 'Zz9$Otra-Cosa-Aqui!', newPassword: NEW_PASSWORD })
        .expect(401);
    });

    it('applies the policy to the new password', async () => {
      const user = await env.createUser();

      await http
        .post('/api/v2/auth/change-password')
        .set('Authorization', env.as(user))
        .send({ currentPassword: VALID_PASSWORD, newPassword: 'todominusculas1234' })
        .expect(422);
    });

    it('changes the password and closes ALL sessions, the current one included', async () => {
      const user = await env.createUser();
      const header = env.as(user);

      await http
        .post('/api/v2/auth/change-password')
        .set('Authorization', header)
        .send({ currentPassword: VALID_PASSWORD, newPassword: NEW_PASSWORD })
        .expect(204);

      // If an attacker had an open session, it dies here.
      await http.get('/api/v2/auth/me').set('Authorization', header).expect(401);

      await signIn(user.email, VALID_PASSWORD).expect(401);
      await signIn(user.email, NEW_PASSWORD).expect(200);
    });
  });

  // ── Admin panel ────────────────────────────────────────────────────────────

  describe('Admin panel', () => {
    const createAdmin = () => env.createUser({ role: 'admin', displayName: 'La Jefa' });

    it.each([
      ['get', '/api/v2/admin/users'],
      ['get', '/api/v2/admin/audit-log'],
    ])('a regular user gets 403 on %s %s', async (method, path) => {
      const user = await env.createUser({ role: 'user' });
      await http[method as 'get'](path).set('Authorization', env.as(user)).expect(403);
    });

    it('unauthenticated answers 401, not 403: authenticate first, authorise after', async () => {
      await http.get('/api/v2/admin/users').expect(401);
    });

    it('approving a pending account lets it sign in', async () => {
      const admin = await createAdmin();
      const pendingUser = await env.createUser({ status: 'pending' });

      await signIn(pendingUser.email, VALID_PASSWORD).expect(403);

      const response = await http
        .post(`/api/v2/admin/users/${pendingUser.id}/approve`)
        .set('Authorization', env.as(admin))
        .expect(201);

      expect(response.body.data.status).toBe('active');
      await signIn(pendingUser.email, VALID_PASSWORD).expect(200);

      const approved = await env.prisma.user.findUniqueOrThrow({
        where: { id: pendingUser.id },
      });
      expect(approved.approvedById).toBe(admin.id);
    });

    it('lists the pending ones first, since they are the ones that need a decision', async () => {
      const admin = await createAdmin();
      await env.createUser({ status: 'pending' });

      const response = await http
        .get('/api/v2/admin/users?status=pending')
        .set('Authorization', env.as(admin))
        .expect(200);

      expect(response.body.data).toHaveLength(1);
      expect(response.body.data[0].status).toBe('pending');
      expect(response.body.meta.total).toBe(1);
      // The list NEVER exposes the password hash.
      expect(JSON.stringify(response.body)).not.toMatch(/argon2|password/i);
    });

    it("suspending revokes the suspended user's sessions instantly", async () => {
      const admin = await createAdmin();
      const victim = await env.createUser();
      const victimHeader = env.as(victim);

      await http.get('/api/v2/auth/me').set('Authorization', victimHeader).expect(200);

      await http
        .post(`/api/v2/admin/users/${victim.id}/suspend`)
        .set('Authorization', env.as(admin))
        .expect(201);

      // 401 and not 403: suspending also moves `sessionsValidFrom` forward, and
      // the guard checks revocation before status. The effect for whoever was
      // inside is the same —locked out on the next request— and the message
      // reveals less.
      await http.get('/api/v2/auth/me').set('Authorization', victimHeader).expect(401);

      // Nor can they come back in through the door.
      await signIn(victim.email, VALID_PASSWORD).expect(403);
    });

    it('an admin cannot suspend themselves', async () => {
      const admin = await createAdmin();

      await http
        .post(`/api/v2/admin/users/${admin.id}/suspend`)
        .set('Authorization', env.as(admin))
        .expect(400);
    });

    it('the system cannot be left without any administrator', async () => {
      const admin = await createAdmin();
      const other = await env.createUser({ role: 'admin' });

      // Demoting the other admin leaves one: allowed.
      await http
        .post(`/api/v2/admin/users/${other.id}/role`)
        .set('Authorization', env.as(admin))
        .send({ role: 'user' })
        .expect(201);

      // Now `admin` is the only one left, and can neither demote itself nor be
      // demoted without leaving the panel unreachable forever.
      const third = await env.createUser({ role: 'admin' });
      await http
        .post(`/api/v2/admin/users/${admin.id}/role`)
        .set('Authorization', env.as(third))
        .send({ role: 'user' })
        .expect(201);

      await http
        .post(`/api/v2/admin/users/${third.id}/suspend`)
        .set('Authorization', env.as(third))
        .expect(400);
    });

    it("resetting the password applies the policy and closes the affected user's sessions", async () => {
      const admin = await createAdmin();
      const forgetful = await env.createUser();
      const header = env.as(forgetful);

      await http
        .post(`/api/v2/admin/users/${forgetful.id}/reset-password`)
        .set('Authorization', env.as(admin))
        .send({ newPassword: 'floja' })
        .expect(422);

      await http
        .post(`/api/v2/admin/users/${forgetful.id}/reset-password`)
        .set('Authorization', env.as(admin))
        .send({ newPassword: NEW_PASSWORD })
        .expect(204);

      await http.get('/api/v2/auth/me').set('Authorization', header).expect(401);
      await signIn(forgetful.email, NEW_PASSWORD).expect(200);
    });

    it("changing someone's role closes their sessions", async () => {
      const admin = await createAdmin();
      const user = await env.createUser({ role: 'user' });
      const header = env.as(user);

      await http
        .post(`/api/v2/admin/users/${user.id}/role`)
        .set('Authorization', env.as(admin))
        .send({ role: 'admin' })
        .expect(201);

      await http.get('/api/v2/auth/me').set('Authorization', header).expect(401);
    });

    it('rejects a role that does not exist', async () => {
      const admin = await createAdmin();
      const user = await env.createUser();

      await http
        .post(`/api/v2/admin/users/${user.id}/role`)
        .set('Authorization', env.as(admin))
        .send({ role: 'superadmin' })
        .expect(400);
    });
  });

  // ── Audit ──────────────────────────────────────────────────────────────────

  describe('Audit', () => {
    it('records a successful login with the user it belongs to', async () => {
      const user = await env.createUser();
      await signIn(user.email, VALID_PASSWORD).expect(200);

      const events = await env.prisma.auditLog.findMany({
        where: { action: 'auth.login' },
      });
      expect(events).toHaveLength(1);
      expect(events[0]!.userId).toBe(user.id);
    });

    it('records the attempt against an unknown email with a null user_id', async () => {
      // That is why `audit_log.userId` is nullable: without that departure from
      // the canonical schema, attempts against emails that do not exist —exactly
      // the ones that give away a sweep— would be recorded nowhere.
      await signIn('fantasma@pruebas.coco', 'Zz9$Otra-Cosa-Aqui!').expect(401);

      const events = await env.prisma.auditLog.findMany({
        where: { action: 'auth.login_failed' },
      });
      expect(events).toHaveLength(1);
      expect(events[0]!.userId).toBeNull();
      // "The email does not exist" is no longer told apart from "the password is
      // wrong": the check happens inside Supabase, which answers the same in both
      // cases. From the outside that is what we want; what is lost is the detail
      // in the audit log.
      expect(events[0]!.changesJson).toEqual({ reason: 'invalid_credentials' });
    });

    it('the audit log never stores the password or the token', async () => {
      const user = await env.createUser();
      await signIn(user.email, VALID_PASSWORD).expect(200);
      await signIn(user.email, 'Zz9$Otra-Cosa-Aqui!').expect(401);

      const events = await env.prisma.auditLog.findMany();
      const dump = JSON.stringify(events);
      expect(dump).not.toContain(VALID_PASSWORD);
      expect(dump).not.toContain('Zz9$Otra-Cosa-Aqui!');
      expect(dump).not.toMatch(/\$argon2/);
    });

    it('the admin can read the audit log', async () => {
      const admin = await env.createUser({ role: 'admin' });
      await signIn(admin.email, VALID_PASSWORD).expect(200);

      const response = await http
        .get('/api/v2/admin/audit-log')
        .set('Authorization', env.as(admin))
        .expect(200);

      expect(response.body.data.length).toBeGreaterThan(0);
      expect(response.body.data[0]).toMatchObject({
        action: expect.any(String),
        entity: 'users',
      });
    });

    it('hands out entries recorded with the old keys in the current shape', async () => {
      // Rows written before the English rename keep `de`/`a`/`motivo`: they are
      // not rewritten (plan 8.7), so the reader has to accept both shapes.
      const admin = await env.createUser({ role: 'admin' });
      const user = await env.createUser();
      const recorded = [
        {
          action: 'admin.role_changed',
          changesJson: Object.fromEntries([
            ['de', 'user'],
            ['a', 'admin'],
          ]),
        },
        { action: 'admin.role_changed', changesJson: { from: 'user', to: 'admin' } },
        {
          action: 'auth.login_failed',
          changesJson: Object.fromEntries([['motivo', 'credenciales_incorrectas']]),
        },
        { action: 'auth.login_failed', changesJson: { reason: 'invalid_credentials' } },
      ];
      for (const entry of recorded) {
        await env.prisma.auditLog.create({
          data: { ...entry, entity: 'users', entityId: user.id, userId: admin.id },
        });
      }

      const response = await http
        .get('/api/v2/admin/audit-log?perPage=50')
        .set('Authorization', env.as(admin))
        .expect(200);

      const changes = (response.body.data as { entityId: number; changes: unknown }[])
        .filter((entry) => entry.entityId === Number(user.id))
        .map((entry) => entry.changes);
      // `jsonb` reorders the keys, so the comparison does not depend on order.
      const roleChange = { from: 'user', to: 'admin' };
      const failedLogin = { reason: 'invalid_credentials' };
      expect(changes).toHaveLength(4);
      expect(changes.filter((c) => isDeepStrictEqual(c, roleChange))).toHaveLength(2);
      expect(changes.filter((c) => isDeepStrictEqual(c, failedLogin))).toHaveLength(2);
    });
  });

  // ── Surface ────────────────────────────────────────────────────────────────

  describe('API surface', () => {
    it('rejects fields that are not in the DTO', async () => {
      // `forbidNonWhitelisted`: if someone tries to slip a `role` or a `status`
      // into the sign-up, it dies in the pipe and never reaches the service.
      await register({ role: 'admin', status: 'active' }).expect(400);
    });

    it('rejects a malformed email', async () => {
      await register({ email: 'esto-no-es-un-correo' }).expect(400);
    });

    it('GET /auth/me returns the profile without the password hash', async () => {
      const user = await env.createUser();

      const response = await http
        .get('/api/v2/auth/me')
        .set('Authorization', env.as(user))
        .expect(200);

      expect(response.body.data).toEqual({
        id: Number(user.id),
        email: user.email,
        displayName: user.displayName,
        role: 'user',
        status: 'active',
        createdAt: expect.any(String),
        // Feature flags on for this user (step 7.8): none without FEATURES.
        features: [],
      });
    });
  });
});
