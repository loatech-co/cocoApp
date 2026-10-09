import request from 'supertest';

import { startApp, type TestEnvironment, type TestUser } from './helpers/app';

/**
 * Fase 2 — lo que la ficha enseña al servidor al guardar.
 *
 * `POST /categorization/learn` es el camino por el que el sistema mejora con
 * el uso: la ficha lo llama cuando hubo una sugerencia y el movimiento se
 * guardó clasificado, y lo que quedó —aceptado o corregido— se vuelve regla.
 *
 * Lo que se protege aquí es lo que no puede fallar en silencio: que aceptar
 * cree la regla, que corregir la ACTUALICE en vez de dejar dos reglas que se
 * contradicen, que una descripción que no dice nada no deje basura, y que
 * nadie pueda apuntar una regla a la categoría de otra cuenta.
 */
describe('Fase 2 — Aprender al guardar (e2e)', () => {
  let env: TestEnvironment;
  let http: ReturnType<typeof request>;

  let ana: TestUser;
  let beto: TestUser;
  let asAna: string;
  let asBeto: string;

  beforeAll(async () => {
    env = await startApp();
    http = request(env.app.getHttpServer());
  });

  afterAll(async () => {
    await env.close();
  });

  beforeEach(async () => {
    await env.clean();
    ana = await env.createUser({ displayName: 'Ana' });
    beto = await env.createUser({ displayName: 'Beto' });
    asAna = env.as(ana);
    asBeto = env.as(beto);
  });

  // ── Helpers ────────────────────────────────────────────────────────────────

  const createCategory = async (auth: string, name: string) => {
    const response = await http
      .post('/api/v2/categories')
      .set('Authorization', auth)
      .send({ name, kind: 'expense' })
      .expect(201);
    return response.body.data as { id: number };
  };

  const learn = (auth: string, description: string, categoryId: number) =>
    http
      .post('/api/v2/categorization/learn')
      .set('Authorization', auth)
      .send({ description, categoryId });

  /** Las reglas de un usuario, leídas de la base: lo que de verdad quedó. */
  const rulesOf = (user: TestUser) =>
    env.prisma.categoryRule.findMany({
      where: { userId: user.id },
      select: { pattern: true, categoryId: true, priority: true, hits: true },
    });

  // ── Aceptar y corregir ─────────────────────────────────────────────────────

  it('aceptar una sugerencia crea la regla con el token que la describe', async () => {
    const energy = await createCategory(asAna, 'Energía');

    const r = await learn(asAna, 'Pago Celsia Energía', energy.id).expect(201);
    expect(r.body.data).toEqual({ learned: true });

    // «pago» es genérico y se descarta; de «celsia» y «energia» gana el más
    // largo. Sin tildes: la regla tiene que coincidir con lo que escriba la
    // persona la próxima vez, y nadie escribe igual dos veces.
    expect(await rulesOf(ana)).toEqual([
      { pattern: 'energia', categoryId: BigInt(energy.id), priority: 10, hits: 1 },
    ]);
  });

  it('corregir una sugerencia ACTUALIZA la regla en vez de dejar dos que se contradicen', async () => {
    const energy = await createCategory(asAna, 'Energía');
    const gas = await createCategory(asAna, 'Gas');

    await learn(asAna, 'Pago Celsia Energía', energy.id).expect(201);
    // La misma descripción, otra categoría: la persona corrigió.
    await learn(asAna, 'Pago Celsia Energía', gas.id).expect(201);

    // Una sola regla, apuntando a lo último que se dijo, y con los dos golpes
    // contados: es la clave `(userId, pattern)` haciendo su trabajo.
    expect(await rulesOf(ana)).toEqual([
      { pattern: 'energia', categoryId: BigInt(gas.id), priority: 10, hits: 2 },
    ]);
  });

  it('lo aprendido es lo que la sugerencia devuelve la próxima vez', async () => {
    const energy = await createCategory(asAna, 'Energía');
    await learn(asAna, 'Pago Celsia Energía', energy.id).expect(201);

    const r = await http
      .get('/api/v2/categorization/suggest?description=Energ%C3%ADa%20octubre')
      .set('Authorization', asAna)
      .expect(200);

    expect(r.body.data).toMatchObject({ categoryId: energy.id, reason: 'rule' });
  });

  // ── Lo que no deja regla ───────────────────────────────────────────────────

  it('una descripción vacía no crea reglas, y lo dice', async () => {
    const energy = await createCategory(asAna, 'Energía');

    const r = await learn(asAna, '', energy.id).expect(201);
    expect(r.body.data).toEqual({ learned: false });
    expect(await rulesOf(ana)).toEqual([]);
  });

  it('una descripción hecha solo de palabras genéricas tampoco', async () => {
    const energy = await createCategory(asAna, 'Energía');

    // Todo genérico o demasiado corto o un número: no hay nada que recordar.
    // Una regla «pago» clasificaría la mitad de los movimientos como energía.
    const r = await learn(asAna, 'PAGO FACTURA SERVICIOS 2026', energy.id).expect(201);
    expect(r.body.data).toEqual({ learned: false });
    expect(await rulesOf(ana)).toEqual([]);
  });

  // ── Aislamiento ────────────────────────────────────────────────────────────

  it('rechaza una categoría de otra cuenta y no deja rastro', async () => {
    const betos = await createCategory(asBeto, 'Energía');

    await learn(asAna, 'Pago Celsia Energía', betos.id).expect(422);

    expect(await rulesOf(ana)).toEqual([]);
    expect(await rulesOf(beto)).toEqual([]);
  });

  it('exige el cuerpo completo: sin categoría o sin descripción es 400', async () => {
    await http
      .post('/api/v2/categorization/learn')
      .set('Authorization', asAna)
      .send({ description: 'Celsia' })
      .expect(400);
    await http
      .post('/api/v2/categorization/learn')
      .set('Authorization', asAna)
      .send({ categoryId: 1 })
      .expect(400);
  });
});
