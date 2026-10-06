import request from 'supertest';

import { levantarApp, type EntornoDePruebas } from './helpers/app';

/**
 * Feature flags reach clients through `/auth/me` (step 7.8).
 *
 * The app boots with `FEATURES=flags_canary`, the registry's canary, which
 * nothing reads. What is checked end to end: the server source, a user's own
 * `feature:<name>` row winning over it, that a user cannot write that row
 * through the preferences endpoint, and that the field is additive.
 */
describe('Feature flags in /auth/me (e2e)', () => {
  let entorno: EntornoDePruebas;
  let http: ReturnType<typeof request>;
  const previous = process.env.FEATURES;

  beforeAll(async () => {
    process.env.FEATURES = 'flags_canary';
    entorno = await levantarApp();
    http = request(entorno.app.getHttpServer());
  });

  afterAll(async () => {
    await entorno.cerrar();
    if (previous === undefined) delete process.env.FEATURES;
    else process.env.FEATURES = previous;
  });

  beforeEach(async () => {
    await entorno.limpiar();
  });

  it('lists the flags FEATURES turns on, next to the profile it already had', async () => {
    const ana = await entorno.crearUsuario();
    const me = await http
      .get('/api/v2/auth/me')
      .set('Authorization', entorno.como(ana))
      .expect(200);

    expect(me.body.data.features).toEqual(['flags_canary']);
    expect(me.body.data).toEqual(
      expect.objectContaining({ email: expect.any(String), role: 'user', status: 'active' }),
    );
  });

  it('the flags sit next to the camelCase profile, per user', async () => {
    const ana = await entorno.crearUsuario();
    await entorno.prisma.userPreference.create({
      data: { userId: ana.id, prefKey: 'feature:flags_canary', prefValue: false },
    });
    const bruno = await entorno.crearUsuario();

    const asAna = await http.get('/api/v2/auth/me').set('Authorization', entorno.como(ana));
    const asBruno = await http
      .get('/api/v2/auth/me')
      .set('Authorization', entorno.como(bruno))
      .expect(200);

    expect(asAna.body.data.features).toEqual([]);
    expect(asBruno.body.data.features).toEqual(['flags_canary']);
    expect(asBruno.body.data).toEqual(
      expect.objectContaining({ displayName: expect.any(String), createdAt: expect.any(String) }),
    );
  });

  it("a user's own feature:<name> = false keeps that user out", async () => {
    const ana = await entorno.crearUsuario();
    const bruno = await entorno.crearUsuario();
    await entorno.prisma.userPreference.create({
      data: { userId: bruno.id, prefKey: 'feature:flags_canary', prefValue: false },
    });

    const asBruno = await http.get('/api/v2/auth/me').set('Authorization', entorno.como(bruno));
    const asAna = await http.get('/api/v2/auth/me').set('Authorization', entorno.como(ana));
    expect(asBruno.body.data.features).toEqual([]);
    expect(asAna.body.data.features).toEqual(['flags_canary']);
  });

  it('the preferences endpoint cannot write a flag', async () => {
    const ana = await entorno.crearUsuario();
    await http
      .patch('/api/v2/preferences')
      .set('Authorization', entorno.como(ana))
      .send({ 'feature:flags_canary': false });

    const rows = await entorno.prisma.userPreference.count({
      where: { userId: ana.id, prefKey: { startsWith: 'feature:' } },
    });
    expect(rows).toBe(0);
  });

  it('the flags do not change the rest of the preferences', async () => {
    const ana = await entorno.crearUsuario();
    await entorno.prisma.userPreference.create({
      data: { userId: ana.id, prefKey: 'feature:flags_canary', prefValue: true },
    });

    const preferences = await http
      .get('/api/v2/preferences')
      .set('Authorization', entorno.como(ana))
      .expect(200);
    expect(preferences.body.data).toEqual({ accountsEnabled: false });
  });
});
