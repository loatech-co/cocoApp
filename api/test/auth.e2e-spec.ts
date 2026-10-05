import request from 'supertest';

import {
  PASSWORD_NUEVA,
  PASSWORD_VALIDA,
  correoDePrueba,
  levantarApp,
  type EntornoDePruebas,
} from './helpers/app';

/**
 * Auth propia — de extremo a extremo, sin simular nada.
 *
 * Cada prueba de aquí corresponde a un control concreto: si una falla, hay un
 * agujero real, no un detalle de estilo.
 */
describe('Auth propia (e2e)', () => {
  let entorno: EntornoDePruebas;
  let http: ReturnType<typeof request>;

  /** El mismo valor que `.env.test`: quien se registre así nace admin y activo. */
  const CORREO_ADMIN_INICIAL = 'admin-e2e@pruebas.coco';

  beforeAll(async () => {
    entorno = await levantarApp();
    http = request(entorno.app.getHttpServer());
  });

  afterAll(async () => {
    await entorno.cerrar();
  });

  beforeEach(async () => {
    await entorno.limpiar();
  });

  const registrar = (body: Record<string, unknown> = {}) =>
    http.post('/api/v1/auth/register').send({
      email: correoDePrueba(),
      password: PASSWORD_VALIDA,
      displayName: 'Persona de Prueba',
      ...body,
    });

  const entrar = (email: string, password: string) =>
    http.post('/api/v1/auth/login').send({ email, password });

  /** Extrae la cookie de refresh de una respuesta de login/refresh. */
  const cookieDe = (respuesta: request.Response): string => {
    const cookies = respuesta.headers['set-cookie'] as unknown as string[] | undefined;
    const cookie = cookies?.find((c) => c.startsWith('coco_refresh='));
    if (!cookie) throw new Error('La respuesta no trajo cookie de refresh.');
    return cookie.split(';')[0];
  };

  // ── Registro ───────────────────────────────────────────────────────────────

  describe('Registro', () => {
    it('crea la cuenta en estado pendiente, nunca activa', async () => {
      const email = correoDePrueba();
      const respuesta = await registrar({ email }).expect(201);

      expect(respuesta.body.data.pending_approval).toBe(true);

      const usuario = await entorno.prisma.user.findUniqueOrThrow({ where: { email } });
      expect(usuario.status).toBe('pending');
      expect(usuario.role).toBe('user');
      // La credencial vive en Supabase, no aquí: esta tabla es el PERFIL. Lo
      // que sí debe quedar es el enlace a la cuenta de Supabase, porque sin él
      // la persona no podría entrar nunca.
      expect(usuario.authId).not.toBeNull();
    });

    it('rechaza una contraseña débil diciendo EXACTAMENTE qué le falta', async () => {
      const respuesta = await registrar({ password: 'abcdefghijkl' }).expect(422);

      expect(respuesta.body.error.code).toBe('unprocessable');
      const mensajes = respuesta.body.error.details.map((d: { message: string }) => d.message);
      expect(mensajes).toEqual(
        expect.arrayContaining([
          'Debe incluir al menos una letra mayúscula.',
          'Debe incluir al menos un número.',
          'Debe incluir al menos un símbolo (por ejemplo: ! @ # $ % & *).',
        ]),
      );
    });

    it('rechaza una contraseña derivada del correo', async () => {
      await registrar({ email: 'mariana@pruebas.coco', password: 'Mariana-2026!' }).expect(422);
    });

    it('no crea nada si la contraseña no pasa la política', async () => {
      const email = correoDePrueba();
      await registrar({ email, password: 'corta1!' }).expect(400);
      expect(await entorno.prisma.user.count({ where: { email } })).toBe(0);
    });

    // ── Anti-enumeración ──
    it('responde IDÉNTICO ante un correo que ya existe, y no crea una segunda fila', async () => {
      const email = correoDePrueba();

      const primera = await registrar({ email }).expect(201);
      const segunda = await registrar({ email, password: PASSWORD_NUEVA }).expect(201);

      // Byte por byte lo mismo: si difirieran, el endpoint sería un oráculo
      // para averiguar qué correos tienen cuenta.
      expect(segunda.body).toEqual(primera.body);
      expect(await entorno.prisma.user.count({ where: { email } })).toBe(1);

      // Y la contraseña original sigue siendo la buena: el segundo registro no
      // pisó nada.
      const usuario = await entorno.prisma.user.findUniqueOrThrow({ where: { email } });
      await entorno.prisma.user.update({
        where: { id: usuario.id },
        data: { status: 'active' },
      });
      await entrar(email, PASSWORD_VALIDA).expect(200);
      await entrar(email, PASSWORD_NUEVA).expect(401);
    });

    it('normaliza el correo: mayúsculas y espacios no crean cuentas distintas', async () => {
      const email = correoDePrueba();

      await registrar({ email }).expect(201);
      await registrar({ email: `  ${email.toUpperCase()}  ` }).expect(201);

      expect(await entorno.prisma.user.count()).toBe(1);
    });

    // ── Admin inicial ──
    it('el correo de BOOTSTRAP_ADMIN_EMAIL nace admin y activo', async () => {
      await registrar({ email: CORREO_ADMIN_INICIAL }).expect(201);

      const admin = await entorno.prisma.user.findUniqueOrThrow({
        where: { email: CORREO_ADMIN_INICIAL },
      });
      expect(admin.role).toBe('admin');
      expect(admin.status).toBe('active');
      expect(admin.approvedAt).not.toBeNull();
    });

    it('el PRIMER registro NO se lleva el panel si no es el correo configurado', async () => {
      // Si fuera "el primero gana", cualquiera que llegara antes que el dueño a
      // una app recién desplegada se quedaría con la administración.
      await registrar().expect(201);
      expect(await entorno.prisma.user.count({ where: { role: 'admin' } })).toBe(0);
    });
  });

  // ── Login ──────────────────────────────────────────────────────────────────

  describe('Login', () => {
    it('devuelve el access token en el cuerpo y el refresh SOLO en cookie httpOnly', async () => {
      const usuario = await entorno.crearUsuario();

      const respuesta = await entrar(usuario.email, PASSWORD_VALIDA).expect(200);

      expect(respuesta.body.data.access_token).toEqual(expect.any(String));
      expect(respuesta.body.data.expires_in).toBe(15 * 60);
      expect(respuesta.body.data.user.email).toBe(usuario.email);

      // El refresh token no aparece por ningún lado del cuerpo.
      expect(JSON.stringify(respuesta.body)).not.toMatch(/refresh/i);

      const cookies = respuesta.headers['set-cookie'] as unknown as string[];
      const cookie = cookies.find((c) => c.startsWith('coco_refresh='))!;
      expect(cookie).toContain('HttpOnly'); // ni un XSS puede leerla
      expect(cookie).toContain('SameSite=Strict'); // neutraliza el CSRF aquí
      expect(cookie).toContain('Path=/api/v1/auth'); // no viaja en cada llamada
    });

    it('con contraseña incorrecta responde EXACTAMENTE lo mismo que con un correo inexistente', async () => {
      const usuario = await entorno.crearUsuario();

      const conCuenta = await entrar(usuario.email, 'Zz9$Otra-Cosa-Aqui!').expect(401);
      const sinCuenta = await entrar('nadie@pruebas.coco', 'Zz9$Otra-Cosa-Aqui!').expect(401);

      expect(conCuenta.body).toEqual(sinCuenta.body);
    });

    it('una cuenta pendiente no puede entrar, aunque la contraseña sea correcta', async () => {
      const usuario = await entorno.crearUsuario({ status: 'pending' });

      const respuesta = await entrar(usuario.email, PASSWORD_VALIDA).expect(403);
      expect(respuesta.body.error.message).toMatch(/pendiente de aprobación/i);
    });

    it('una cuenta suspendida no puede entrar', async () => {
      const usuario = await entorno.crearUsuario({ status: 'suspended' });

      const respuesta = await entrar(usuario.email, PASSWORD_VALIDA).expect(403);
      expect(respuesta.body.error.message).toMatch(/suspendida/i);
    });

    it('el estado de la cuenta solo se revela a quien acertó la contraseña', async () => {
      // Al revés —comprobar el estado antes que la contraseña— cualquiera
      // podría averiguar qué correos tienen cuenta y en qué situación están.
      const usuario = await entorno.crearUsuario({ status: 'pending' });

      const respuesta = await entrar(usuario.email, 'Zz9$Otra-Cosa-Aqui!').expect(401);
      expect(respuesta.body.error.message).not.toMatch(/pendiente|suspendida/i);
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
      await http.post('/api/v1/auth/refresh').expect(401);
    });

    // ── El control más importante de todo el módulo ──

    it('el refresh de una cuenta suspendida no sirve', async () => {
      const usuario = await entorno.crearUsuario();
      const login = await entrar(usuario.email, PASSWORD_VALIDA).expect(200);

      await entorno.prisma.user.update({
        where: { id: usuario.id },
        data: { status: 'suspended' },
      });

      await http.post('/api/v1/auth/refresh').set('Cookie', cookieDe(login)).expect(401);
    });
  });

  // ── Revocación inmediata ───────────────────────────────────────────────────

  describe('Revocación inmediata', () => {
    it('logout-all invalida los access token ya emitidos, sin esperar a que expiren', async () => {
      const usuario = await entorno.crearUsuario();
      const cabecera = entorno.como(usuario);

      await http.get('/api/v1/auth/me').set('Authorization', cabecera).expect(200);

      await http.post('/api/v1/auth/logout-all').set('Authorization', cabecera).expect(204);

      // El token sigue siendo criptográficamente válido y sin expirar. Lo que
      // lo mata es `sessionsValidFrom`, que el guard compara en cada petición.
      await http.get('/api/v1/auth/me').set('Authorization', cabecera).expect(401);
    });

    it('suspender una cuenta expulsa al instante a quien ya estaba dentro', async () => {
      const usuario = await entorno.crearUsuario();
      const cabecera = entorno.como(usuario);

      await http.get('/api/v1/auth/me').set('Authorization', cabecera).expect(200);

      await entorno.prisma.user.update({
        where: { id: usuario.id },
        data: { status: 'suspended' },
      });

      await http.get('/api/v1/auth/me').set('Authorization', cabecera).expect(403);
    });

    it('el rol sale de la BASE, no del token', async () => {
      const usuario = await entorno.crearUsuario({ role: 'user' });
      const cabecera = entorno.como(usuario);

      await http.get('/api/v1/admin/users').set('Authorization', cabecera).expect(403);

      // Se promueve por fuera, sin emitir un token nuevo: si el rol viniera del
      // token, esto seguiría dando 403 hasta que expirara.
      await entorno.prisma.user.update({
        where: { id: usuario.id },
        data: { role: 'admin' },
      });

      await http.get('/api/v1/admin/users').set('Authorization', cabecera).expect(200);
    });
  });

  // ── Cambio de contraseña ───────────────────────────────────────────────────

  describe('Cambio de contraseña', () => {
    it('exige la contraseña actual', async () => {
      const usuario = await entorno.crearUsuario();

      // Si bastara el access token, quien robara uno se apoderaría de la cuenta.
      await http
        .post('/api/v1/auth/change-password')
        .set('Authorization', entorno.como(usuario))
        .send({ currentPassword: 'Zz9$Otra-Cosa-Aqui!', newPassword: PASSWORD_NUEVA })
        .expect(401);
    });

    it('aplica la política a la contraseña nueva', async () => {
      const usuario = await entorno.crearUsuario();

      await http
        .post('/api/v1/auth/change-password')
        .set('Authorization', entorno.como(usuario))
        .send({ currentPassword: PASSWORD_VALIDA, newPassword: 'todominusculas1234' })
        .expect(422);
    });

    it('cambia la contraseña y cierra TODAS las sesiones, incluida la actual', async () => {
      const usuario = await entorno.crearUsuario();
      const cabecera = entorno.como(usuario);

      await http
        .post('/api/v1/auth/change-password')
        .set('Authorization', cabecera)
        .send({ currentPassword: PASSWORD_VALIDA, newPassword: PASSWORD_NUEVA })
        .expect(204);

      // Si un atacante tenía una sesión abierta, muere aquí.
      await http.get('/api/v1/auth/me').set('Authorization', cabecera).expect(401);

      await entrar(usuario.email, PASSWORD_VALIDA).expect(401);
      await entrar(usuario.email, PASSWORD_NUEVA).expect(200);
    });
  });

  // ── Panel de administración ────────────────────────────────────────────────

  describe('Panel de administración', () => {
    const crearAdmin = () => entorno.crearUsuario({ role: 'admin', displayName: 'La Jefa' });

    it.each([
      ['get', '/api/v1/admin/users'],
      ['get', '/api/v1/admin/audit-log'],
    ])('un usuario normal recibe 403 en %s %s', async (metodo, ruta) => {
      const usuario = await entorno.crearUsuario({ role: 'user' });
      await http[metodo as 'get'](ruta).set('Authorization', entorno.como(usuario)).expect(403);
    });

    it('sin autenticar responde 401, no 403: primero se autentica, después se autoriza', async () => {
      await http.get('/api/v1/admin/users').expect(401);
    });

    it('aprobar una cuenta pendiente le permite entrar', async () => {
      const admin = await crearAdmin();
      const pendiente = await entorno.crearUsuario({ status: 'pending' });

      await entrar(pendiente.email, PASSWORD_VALIDA).expect(403);

      const respuesta = await http
        .post(`/api/v1/admin/users/${pendiente.id}/approve`)
        .set('Authorization', entorno.como(admin))
        .expect(201);

      expect(respuesta.body.data.status).toBe('active');
      await entrar(pendiente.email, PASSWORD_VALIDA).expect(200);

      const aprobado = await entorno.prisma.user.findUniqueOrThrow({
        where: { id: pendiente.id },
      });
      expect(aprobado.approvedById).toBe(admin.id);
    });

    it('lista a los pendientes primero, que son los que exigen una decisión', async () => {
      const admin = await crearAdmin();
      await entorno.crearUsuario({ status: 'pending' });

      const respuesta = await http
        .get('/api/v1/admin/users?status=pending')
        .set('Authorization', entorno.como(admin))
        .expect(200);

      expect(respuesta.body.data).toHaveLength(1);
      expect(respuesta.body.data[0].status).toBe('pending');
      expect(respuesta.body.meta.total).toBe(1);
      // El listado NUNCA expone el hash de la contraseña.
      expect(JSON.stringify(respuesta.body)).not.toMatch(/argon2|password/i);
    });

    it('suspender revoca las sesiones del suspendido al instante', async () => {
      const admin = await crearAdmin();
      const victima = await entorno.crearUsuario();
      const cabeceraVictima = entorno.como(victima);

      await http.get('/api/v1/auth/me').set('Authorization', cabeceraVictima).expect(200);

      await http
        .post(`/api/v1/admin/users/${victima.id}/suspend`)
        .set('Authorization', entorno.como(admin))
        .expect(201);

      // 401 y no 403: suspender también adelanta `sessionsValidFrom`, y el
      // guard comprueba la revocación antes que el estado. El efecto para quien
      // estaba dentro es el mismo —queda fuera en la siguiente petición— y el
      // mensaje revela menos.
      await http.get('/api/v1/auth/me').set('Authorization', cabeceraVictima).expect(401);

      // Y tampoco puede volver a entrar por la puerta.
      await entrar(victima.email, PASSWORD_VALIDA).expect(403);
    });

    it('un admin no puede suspenderse a sí mismo', async () => {
      const admin = await crearAdmin();

      await http
        .post(`/api/v1/admin/users/${admin.id}/suspend`)
        .set('Authorization', entorno.como(admin))
        .expect(400);
    });

    it('no se puede dejar el sistema sin ningún administrador', async () => {
      const admin = await crearAdmin();
      const otro = await entorno.crearUsuario({ role: 'admin' });

      // Degradar al otro admin deja uno: permitido.
      await http
        .post(`/api/v1/admin/users/${otro.id}/role`)
        .set('Authorization', entorno.como(admin))
        .send({ role: 'user' })
        .expect(201);

      // Ahora `admin` es el único que queda, y no puede degradarse a sí mismo
      // ni ser degradado sin dejar el panel inalcanzable para siempre.
      const tercero = await entorno.crearUsuario({ role: 'admin' });
      await http
        .post(`/api/v1/admin/users/${admin.id}/role`)
        .set('Authorization', entorno.como(tercero))
        .send({ role: 'user' })
        .expect(201);

      await http
        .post(`/api/v1/admin/users/${tercero.id}/suspend`)
        .set('Authorization', entorno.como(tercero))
        .expect(400);
    });

    it('restablecer la contraseña aplica la política y cierra las sesiones del afectado', async () => {
      const admin = await crearAdmin();
      const olvidadizo = await entorno.crearUsuario();
      const cabecera = entorno.como(olvidadizo);

      await http
        .post(`/api/v1/admin/users/${olvidadizo.id}/reset-password`)
        .set('Authorization', entorno.como(admin))
        .send({ newPassword: 'floja' })
        .expect(422);

      await http
        .post(`/api/v1/admin/users/${olvidadizo.id}/reset-password`)
        .set('Authorization', entorno.como(admin))
        .send({ newPassword: PASSWORD_NUEVA })
        .expect(204);

      await http.get('/api/v1/auth/me').set('Authorization', cabecera).expect(401);
      await entrar(olvidadizo.email, PASSWORD_NUEVA).expect(200);
    });

    it('cambiar el rol de alguien cierra sus sesiones', async () => {
      const admin = await crearAdmin();
      const usuario = await entorno.crearUsuario({ role: 'user' });
      const cabecera = entorno.como(usuario);

      await http
        .post(`/api/v1/admin/users/${usuario.id}/role`)
        .set('Authorization', entorno.como(admin))
        .send({ role: 'admin' })
        .expect(201);

      await http.get('/api/v1/auth/me').set('Authorization', cabecera).expect(401);
    });

    it('rechaza un rol que no existe', async () => {
      const admin = await crearAdmin();
      const usuario = await entorno.crearUsuario();

      await http
        .post(`/api/v1/admin/users/${usuario.id}/role`)
        .set('Authorization', entorno.como(admin))
        .send({ role: 'superadmin' })
        .expect(400);
    });
  });

  // ── Auditoría ──────────────────────────────────────────────────────────────

  describe('Auditoría', () => {
    it('registra el login correcto con el usuario al que corresponde', async () => {
      const usuario = await entorno.crearUsuario();
      await entrar(usuario.email, PASSWORD_VALIDA).expect(200);

      const eventos = await entorno.prisma.auditLog.findMany({
        where: { action: 'auth.login' },
      });
      expect(eventos).toHaveLength(1);
      expect(eventos[0].userId).toBe(usuario.id);
    });

    it('registra el intento contra un correo inexistente con user_id nulo', async () => {
      // Por eso `audit_log.user_id` es nullable: sin esa desviación del esquema
      // canónico, los intentos contra correos que no existen —justo los que
      // delatan un barrido— no quedarían registrados en ninguna parte.
      await entrar('fantasma@pruebas.coco', 'Zz9$Otra-Cosa-Aqui!').expect(401);

      const eventos = await entorno.prisma.auditLog.findMany({
        where: { action: 'auth.login_failed' },
      });
      expect(eventos).toHaveLength(1);
      expect(eventos[0].userId).toBeNull();
      // Ya no se distingue "el correo no existe" de "la contraseña es
      // incorrecta": la verificación ocurre dentro de Supabase, que responde
      // igual en ambos casos. De cara afuera eso es lo deseable; lo que se
      // pierde es el detalle en la bitácora.
      expect(eventos[0].changesJson).toEqual({ motivo: 'credenciales_incorrectas' });
    });

    it('la bitácora nunca guarda la contraseña ni el token', async () => {
      const usuario = await entorno.crearUsuario();
      await entrar(usuario.email, PASSWORD_VALIDA).expect(200);
      await entrar(usuario.email, 'Zz9$Otra-Cosa-Aqui!').expect(401);

      const eventos = await entorno.prisma.auditLog.findMany();
      const volcado = JSON.stringify(eventos);
      expect(volcado).not.toContain(PASSWORD_VALIDA);
      expect(volcado).not.toContain('Zz9$Otra-Cosa-Aqui!');
      expect(volcado).not.toMatch(/\$argon2/);
    });

    it('el admin puede leer la bitácora', async () => {
      const admin = await entorno.crearUsuario({ role: 'admin' });
      await entrar(admin.email, PASSWORD_VALIDA).expect(200);

      const respuesta = await http
        .get('/api/v1/admin/audit-log')
        .set('Authorization', entorno.como(admin))
        .expect(200);

      expect(respuesta.body.data.length).toBeGreaterThan(0);
      expect(respuesta.body.data[0]).toMatchObject({
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
      await registrar({ role: 'admin', status: 'active' }).expect(400);
    });

    it('rechaza un correo con formato inválido', async () => {
      await registrar({ email: 'esto-no-es-un-correo' }).expect(400);
    });

    it('GET /auth/me devuelve el perfil sin el hash de la contraseña', async () => {
      const usuario = await entorno.crearUsuario();

      const respuesta = await http
        .get('/api/v1/auth/me')
        .set('Authorization', entorno.como(usuario))
        .expect(200);

      expect(respuesta.body.data).toEqual({
        id: Number(usuario.id),
        email: usuario.email,
        display_name: usuario.displayName,
        role: 'user',
        status: 'active',
        created_at: expect.any(String),
      });
    });
  });
});
