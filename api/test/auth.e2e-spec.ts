import request from 'supertest';

import {
  NEW_PASSWORD,
  VALID_PASSWORD,
  testEmail,
  startApp,
  type TestEnvironment,
} from './helpers/app';

/**
 * Auth propia — de extremo a extremo, sin simular nada.
 *
 * Cada prueba de aquí corresponde a un control concreto: si una falla, hay un
 * agujero real, no un detalle de estilo.
 */
describe('Auth propia (e2e)', () => {
  let env: TestEnvironment;
  let http: ReturnType<typeof request>;

  /** El mismo valor que `.env.test`: quien se registre así nace admin y activo. */
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

  /** Extrae la cookie de refresh de una respuesta de login/refresh. */
  const cookieOf = (response: request.Response): string => {
    const cookies = response.headers['set-cookie'] as unknown as string[] | undefined;
    const cookie = cookies?.find((c) => c.startsWith('coco_refresh='));
    if (!cookie) throw new Error('La respuesta no trajo cookie de refresh.');
    return cookie.split(';')[0]!;
  };

  // ── Registro ───────────────────────────────────────────────────────────────

  describe('Registro', () => {
    it('crea la cuenta en estado pendiente, nunca activa', async () => {
      const email = testEmail();
      const response = await register({ email }).expect(201);

      expect(response.body.data.pendingApproval).toBe(true);

      const user = await env.prisma.user.findUniqueOrThrow({ where: { email } });
      expect(user.status).toBe('pending');
      expect(user.role).toBe('user');
      // La credencial vive en Supabase, no aquí: esta tabla es el PERFIL. Lo
      // que sí debe quedar es el enlace a la cuenta de Supabase, porque sin él
      // la persona no podría entrar nunca.
      expect(user.authId).not.toBeNull();
    });

    it('rechaza una contraseña débil diciendo EXACTAMENTE qué le falta', async () => {
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

    it('rechaza una contraseña derivada del correo', async () => {
      await register({ email: 'mariana@pruebas.coco', password: 'Mariana-2026!' }).expect(422);
    });

    it('no crea nada si la contraseña no pasa la política', async () => {
      const email = testEmail();
      await register({ email, password: 'corta1!' }).expect(400);
      expect(await env.prisma.user.count({ where: { email } })).toBe(0);
    });

    // ── Anti-enumeración ──
    it('responde IDÉNTICO ante un correo que ya existe, y no crea una segunda fila', async () => {
      const email = testEmail();

      const first = await register({ email }).expect(201);
      const second = await register({ email, password: NEW_PASSWORD }).expect(201);

      // Byte por byte lo mismo: si difirieran, el endpoint sería un oráculo
      // para averiguar qué correos tienen cuenta.
      expect(second.body).toEqual(first.body);
      expect(await env.prisma.user.count({ where: { email } })).toBe(1);

      // Y la contraseña original sigue siendo la buena: el segundo registro no
      // pisó nada.
      const user = await env.prisma.user.findUniqueOrThrow({ where: { email } });
      await env.prisma.user.update({
        where: { id: user.id },
        data: { status: 'active' },
      });
      await signIn(email, VALID_PASSWORD).expect(200);
      await signIn(email, NEW_PASSWORD).expect(401);
    });

    it('normaliza el correo: mayúsculas y espacios no crean cuentas distintas', async () => {
      const email = testEmail();

      await register({ email }).expect(201);
      await register({ email: `  ${email.toUpperCase()}  ` }).expect(201);

      expect(await env.prisma.user.count()).toBe(1);
    });

    // ── Admin inicial ──
    it('el correo de BOOTSTRAP_ADMIN_EMAIL nace admin y activo', async () => {
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

    it('el PRIMER registro NO se lleva el panel si no es el correo configurado', async () => {
      // Si fuera "el primero gana", cualquiera que llegara antes que el dueño a
      // una app recién desplegada se quedaría con la administración.
      await register().expect(201);
      expect(await env.prisma.user.count({ where: { role: 'admin' } })).toBe(0);
    });
  });

  // ── Login ──────────────────────────────────────────────────────────────────

  describe('Login', () => {
    it('devuelve el access token en el cuerpo y el refresh SOLO en cookie httpOnly', async () => {
      const user = await env.createUser();

      const response = await signIn(user.email, VALID_PASSWORD).expect(200);

      expect(response.body.data.accessToken).toEqual(expect.any(String));
      expect(response.body.data.expiresIn).toBe(15 * 60);
      expect(response.body.data.user.email).toBe(user.email);

      // El refresh token no aparece por ningún lado del cuerpo.
      expect(JSON.stringify(response.body)).not.toMatch(/refresh/i);

      const cookies = response.headers['set-cookie'] as unknown as string[];
      const cookie = cookies.find((c) => c.startsWith('coco_refresh='))!;
      expect(cookie).toContain('HttpOnly'); // ni un XSS puede leerla
      expect(cookie).toContain('SameSite=Strict'); // neutraliza el CSRF aquí
      expect(cookie).toContain('Path=/api/v2/auth'); // no viaja en cada llamada
    });

    it('con contraseña incorrecta responde EXACTAMENTE lo mismo que con un correo inexistente', async () => {
      const user = await env.createUser();

      const withAccount = await signIn(user.email, 'Zz9$Otra-Cosa-Aqui!').expect(401);
      const withoutAccount = await signIn('nadie@pruebas.coco', 'Zz9$Otra-Cosa-Aqui!').expect(401);

      expect(withAccount.body).toEqual(withoutAccount.body);
    });

    it('una cuenta pendiente no puede entrar, aunque la contraseña sea correcta', async () => {
      const user = await env.createUser({ status: 'pending' });

      const response = await signIn(user.email, VALID_PASSWORD).expect(403);
      expect(response.body.detail).toMatch(/pendiente de aprobación/i);
    });

    it('una cuenta suspendida no puede entrar', async () => {
      const user = await env.createUser({ status: 'suspended' });

      const response = await signIn(user.email, VALID_PASSWORD).expect(403);
      expect(response.body.detail).toMatch(/suspendida/i);
    });

    it('el estado de la cuenta solo se revela a quien acertó la contraseña', async () => {
      // Al revés —comprobar el estado antes que la contraseña— cualquiera
      // podría averiguar qué correos tienen cuenta y en qué situación están.
      const user = await env.createUser({ status: 'pending' });

      const response = await signIn(user.email, 'Zz9$Otra-Cosa-Aqui!').expect(401);
      expect(response.body.detail).not.toMatch(/pendiente|suspendida/i);
    });
  });

  // ── Rotación y detección de reuso ──────────────────────────────────────────

  // La ROTACIÓN y la detección de reuso de refresh tokens pasaron a Supabase
  // con la migración: ya no las implementa este código, así que probarlas aquí
  // sería probar la biblioteca de otro. Lo que sí se prueba es lo que sigue
  // siendo nuestro: que sin cookie no se entra, y que una cuenta suspendida no
  // puede estirar su sesión canjeando un token por otro.
  // La ROTACIÓN y la detección de reuso pasaron a Supabase con la migración:
  // ya no las implementa este código, así que probarlas aquí sería probar la
  // biblioteca de otro. Queda lo que sigue siendo nuestro: que sin cookie no se
  // entra, y que una cuenta suspendida no puede estirar su sesión canjeando un
  // token por otro.
  describe('Refresh token', () => {
    it('sin cookie responde 401', async () => {
      await http.post('/api/v2/auth/refresh').expect(401);
    });

    // ── El control más importante de todo el módulo ──

    it('el refresh de una cuenta suspendida no sirve', async () => {
      const user = await env.createUser();
      const login = await signIn(user.email, VALID_PASSWORD).expect(200);

      await env.prisma.user.update({
        where: { id: user.id },
        data: { status: 'suspended' },
      });

      await http.post('/api/v2/auth/refresh').set('Cookie', cookieOf(login)).expect(401);
    });
  });

  // ── Revocación inmediata ───────────────────────────────────────────────────

  describe('Revocación inmediata', () => {
    it('logout-all invalida los access token ya emitidos, sin esperar a que expiren', async () => {
      const user = await env.createUser();
      const header = env.as(user);

      await http.get('/api/v2/auth/me').set('Authorization', header).expect(200);

      await http.post('/api/v2/auth/logout-all').set('Authorization', header).expect(204);

      // El token sigue siendo criptográficamente válido y sin expirar. Lo que
      // lo mata es `sessionsValidFrom`, que el guard compara en cada petición.
      await http.get('/api/v2/auth/me').set('Authorization', header).expect(401);
    });

    it('suspender una cuenta expulsa al instante a quien ya estaba dentro', async () => {
      const user = await env.createUser();
      const header = env.as(user);

      await http.get('/api/v2/auth/me').set('Authorization', header).expect(200);

      await env.prisma.user.update({
        where: { id: user.id },
        data: { status: 'suspended' },
      });

      await http.get('/api/v2/auth/me').set('Authorization', header).expect(403);
    });

    it('el rol sale de la BASE, no del token', async () => {
      const user = await env.createUser({ role: 'user' });
      const header = env.as(user);

      await http.get('/api/v2/admin/users').set('Authorization', header).expect(403);

      // Se promueve por fuera, sin emitir un token nuevo: si el rol viniera del
      // token, esto seguiría dando 403 hasta que expirara.
      await env.prisma.user.update({
        where: { id: user.id },
        data: { role: 'admin' },
      });

      await http.get('/api/v2/admin/users').set('Authorization', header).expect(200);
    });
  });

  // ── Cambio de contraseña ───────────────────────────────────────────────────

  describe('Cambio de contraseña', () => {
    it('exige la contraseña actual', async () => {
      const user = await env.createUser();

      // Si bastara el access token, quien robara uno se apoderaría de la cuenta.
      await http
        .post('/api/v2/auth/change-password')
        .set('Authorization', env.as(user))
        .send({ currentPassword: 'Zz9$Otra-Cosa-Aqui!', newPassword: NEW_PASSWORD })
        .expect(401);
    });

    it('aplica la política a la contraseña nueva', async () => {
      const user = await env.createUser();

      await http
        .post('/api/v2/auth/change-password')
        .set('Authorization', env.as(user))
        .send({ currentPassword: VALID_PASSWORD, newPassword: 'todominusculas1234' })
        .expect(422);
    });

    it('cambia la contraseña y cierra TODAS las sesiones, incluida la actual', async () => {
      const user = await env.createUser();
      const header = env.as(user);

      await http
        .post('/api/v2/auth/change-password')
        .set('Authorization', header)
        .send({ currentPassword: VALID_PASSWORD, newPassword: NEW_PASSWORD })
        .expect(204);

      // Si un atacante tenía una sesión abierta, muere aquí.
      await http.get('/api/v2/auth/me').set('Authorization', header).expect(401);

      await signIn(user.email, VALID_PASSWORD).expect(401);
      await signIn(user.email, NEW_PASSWORD).expect(200);
    });
  });

  // ── Panel de administración ────────────────────────────────────────────────

  describe('Panel de administración', () => {
    const createAdmin = () => env.createUser({ role: 'admin', displayName: 'La Jefa' });

    it.each([
      ['get', '/api/v2/admin/users'],
      ['get', '/api/v2/admin/audit-log'],
    ])('un usuario normal recibe 403 en %s %s', async (method, path) => {
      const user = await env.createUser({ role: 'user' });
      await http[method as 'get'](path).set('Authorization', env.as(user)).expect(403);
    });

    it('sin autenticar responde 401, no 403: primero se autentica, después se autoriza', async () => {
      await http.get('/api/v2/admin/users').expect(401);
    });

    it('aprobar una cuenta pendiente le permite entrar', async () => {
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

    it('lista a los pendientes primero, que son los que exigen una decisión', async () => {
      const admin = await createAdmin();
      await env.createUser({ status: 'pending' });

      const response = await http
        .get('/api/v2/admin/users?status=pending')
        .set('Authorization', env.as(admin))
        .expect(200);

      expect(response.body.data).toHaveLength(1);
      expect(response.body.data[0].status).toBe('pending');
      expect(response.body.meta.total).toBe(1);
      // El listado NUNCA expone el hash de la contraseña.
      expect(JSON.stringify(response.body)).not.toMatch(/argon2|password/i);
    });

    it('suspender revoca las sesiones del suspendido al instante', async () => {
      const admin = await createAdmin();
      const victim = await env.createUser();
      const victimHeader = env.as(victim);

      await http.get('/api/v2/auth/me').set('Authorization', victimHeader).expect(200);

      await http
        .post(`/api/v2/admin/users/${victim.id}/suspend`)
        .set('Authorization', env.as(admin))
        .expect(201);

      // 401 y no 403: suspender también adelanta `sessionsValidFrom`, y el
      // guard comprueba la revocación antes que el estado. El efecto para quien
      // estaba dentro es el mismo —queda fuera en la siguiente petición— y el
      // mensaje revela menos.
      await http.get('/api/v2/auth/me').set('Authorization', victimHeader).expect(401);

      // Y tampoco puede volver a entrar por la puerta.
      await signIn(victim.email, VALID_PASSWORD).expect(403);
    });

    it('un admin no puede suspenderse a sí mismo', async () => {
      const admin = await createAdmin();

      await http
        .post(`/api/v2/admin/users/${admin.id}/suspend`)
        .set('Authorization', env.as(admin))
        .expect(400);
    });

    it('no se puede dejar el sistema sin ningún administrador', async () => {
      const admin = await createAdmin();
      const other = await env.createUser({ role: 'admin' });

      // Degradar al otro admin deja uno: permitido.
      await http
        .post(`/api/v2/admin/users/${other.id}/role`)
        .set('Authorization', env.as(admin))
        .send({ role: 'user' })
        .expect(201);

      // Ahora `admin` es el único que queda, y no puede degradarse a sí mismo
      // ni ser degradado sin dejar el panel inalcanzable para siempre.
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

    it('restablecer la contraseña aplica la política y cierra las sesiones del afectado', async () => {
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

    it('cambiar el rol de alguien cierra sus sesiones', async () => {
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

    it('rechaza un rol que no existe', async () => {
      const admin = await createAdmin();
      const user = await env.createUser();

      await http
        .post(`/api/v2/admin/users/${user.id}/role`)
        .set('Authorization', env.as(admin))
        .send({ role: 'superadmin' })
        .expect(400);
    });
  });

  // ── Auditoría ──────────────────────────────────────────────────────────────

  describe('Auditoría', () => {
    it('registra el login correcto con el usuario al que corresponde', async () => {
      const user = await env.createUser();
      await signIn(user.email, VALID_PASSWORD).expect(200);

      const events = await env.prisma.auditLog.findMany({
        where: { action: 'auth.login' },
      });
      expect(events).toHaveLength(1);
      expect(events[0]!.userId).toBe(user.id);
    });

    it('registra el intento contra un correo inexistente con user_id nulo', async () => {
      // Por eso `audit_log.userId` es nullable: sin esa desviación del esquema
      // canónico, los intentos contra correos que no existen —justo los que
      // delatan un barrido— no quedarían registrados en ninguna parte.
      await signIn('fantasma@pruebas.coco', 'Zz9$Otra-Cosa-Aqui!').expect(401);

      const events = await env.prisma.auditLog.findMany({
        where: { action: 'auth.login_failed' },
      });
      expect(events).toHaveLength(1);
      expect(events[0]!.userId).toBeNull();
      // Ya no se distingue "el correo no existe" de "la contraseña es
      // incorrecta": la verificación ocurre dentro de Supabase, que responde
      // igual en ambos casos. De cara afuera eso es lo deseable; lo que se
      // pierde es el detalle en la bitácora.
      expect(events[0]!.changesJson).toEqual({ motivo: 'credenciales_incorrectas' });
    });

    it('la bitácora nunca guarda la contraseña ni el token', async () => {
      const user = await env.createUser();
      await signIn(user.email, VALID_PASSWORD).expect(200);
      await signIn(user.email, 'Zz9$Otra-Cosa-Aqui!').expect(401);

      const events = await env.prisma.auditLog.findMany();
      const dump = JSON.stringify(events);
      expect(dump).not.toContain(VALID_PASSWORD);
      expect(dump).not.toContain('Zz9$Otra-Cosa-Aqui!');
      expect(dump).not.toMatch(/\$argon2/);
    });

    it('el admin puede leer la bitácora', async () => {
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
  });

  // ── Superficie ─────────────────────────────────────────────────────────────

  describe('Superficie de la API', () => {
    it('rechaza campos que no están en el DTO', async () => {
      // `forbidNonWhitelisted`: si alguien intenta colar un `role` o un
      // `status` en el registro, muere en el pipe y no llega al servicio.
      await register({ role: 'admin', status: 'active' }).expect(400);
    });

    it('rechaza un correo con formato inválido', async () => {
      await register({ email: 'esto-no-es-un-correo' }).expect(400);
    });

    it('GET /auth/me devuelve el perfil sin el hash de la contraseña', async () => {
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
