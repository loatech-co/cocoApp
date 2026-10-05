import request from 'supertest';

import { levantarApp, type EntornoDePruebas, type UsuarioDePrueba } from './helpers/app';

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
  let entorno: EntornoDePruebas;
  let http: ReturnType<typeof request>;

  let ana: UsuarioDePrueba;
  let beto: UsuarioDePrueba;
  let comoAna: string;
  let comoBeto: string;

  beforeAll(async () => {
    entorno = await levantarApp();
    http = request(entorno.app.getHttpServer());
  });

  afterAll(async () => {
    await entorno.cerrar();
  });

  beforeEach(async () => {
    await entorno.limpiar();
    ana = await entorno.crearUsuario({ displayName: 'Ana' });
    beto = await entorno.crearUsuario({ displayName: 'Beto' });
    comoAna = entorno.como(ana);
    comoBeto = entorno.como(beto);
  });

  // ── Helpers ────────────────────────────────────────────────────────────────

  const crearCategoria = async (auth: string, name: string) => {
    const respuesta = await http
      .post('/api/v1/categories')
      .set('Authorization', auth)
      .send({ name, kind: 'expense' })
      .expect(201);
    return respuesta.body.data as { id: number };
  };

  const aprender = (auth: string, description: string, category_id: number) =>
    http
      .post('/api/v1/categorization/learn')
      .set('Authorization', auth)
      .send({ description, category_id });

  /** Las reglas de un usuario, leídas de la base: lo que de verdad quedó. */
  const reglasDe = (usuario: UsuarioDePrueba) =>
    entorno.prisma.categoryRule.findMany({
      where: { userId: usuario.id },
      select: { pattern: true, categoryId: true, priority: true, hits: true },
    });

  // ── Aceptar y corregir ─────────────────────────────────────────────────────

  it('aceptar una sugerencia crea la regla con el token que la describe', async () => {
    const energia = await crearCategoria(comoAna, 'Energía');

    const r = await aprender(comoAna, 'Pago Celsia Energía', energia.id).expect(201);
    expect(r.body.data).toEqual({ aprendido: true });

    // «pago» es genérico y se descarta; de «celsia» y «energia» gana el más
    // largo. Sin tildes: la regla tiene que coincidir con lo que escriba la
    // persona la próxima vez, y nadie escribe igual dos veces.
    expect(await reglasDe(ana)).toEqual([
      { pattern: 'energia', categoryId: BigInt(energia.id), priority: 10, hits: 1 },
    ]);
  });

  it('corregir una sugerencia ACTUALIZA la regla en vez de dejar dos que se contradicen', async () => {
    const energia = await crearCategoria(comoAna, 'Energía');
    const gas = await crearCategoria(comoAna, 'Gas');

    await aprender(comoAna, 'Pago Celsia Energía', energia.id).expect(201);
    // La misma descripción, otra categoría: la persona corrigió.
    await aprender(comoAna, 'Pago Celsia Energía', gas.id).expect(201);

    // Una sola regla, apuntando a lo último que se dijo, y con los dos golpes
    // contados: es la clave `(userId, pattern)` haciendo su trabajo.
    expect(await reglasDe(ana)).toEqual([
      { pattern: 'energia', categoryId: BigInt(gas.id), priority: 10, hits: 2 },
    ]);
  });

  it('lo aprendido es lo que la sugerencia devuelve la próxima vez', async () => {
    const energia = await crearCategoria(comoAna, 'Energía');
    await aprender(comoAna, 'Pago Celsia Energía', energia.id).expect(201);

    const r = await http
      .get('/api/v1/categorization/suggest?description=Energ%C3%ADa%20octubre')
      .set('Authorization', comoAna)
      .expect(200);

    expect(r.body.data).toMatchObject({ category_id: energia.id, reason: 'regla' });
  });

  // ── Lo que no deja regla ───────────────────────────────────────────────────

  it('una descripción vacía no crea reglas, y lo dice', async () => {
    const energia = await crearCategoria(comoAna, 'Energía');

    const r = await aprender(comoAna, '', energia.id).expect(201);
    expect(r.body.data).toEqual({ aprendido: false });
    expect(await reglasDe(ana)).toEqual([]);
  });

  it('una descripción hecha solo de palabras genéricas tampoco', async () => {
    const energia = await crearCategoria(comoAna, 'Energía');

    // Todo genérico o demasiado corto o un número: no hay nada que recordar.
    // Una regla «pago» clasificaría la mitad de los movimientos como energía.
    const r = await aprender(comoAna, 'PAGO FACTURA SERVICIOS 2026', energia.id).expect(201);
    expect(r.body.data).toEqual({ aprendido: false });
    expect(await reglasDe(ana)).toEqual([]);
  });

  // ── Aislamiento ────────────────────────────────────────────────────────────

  it('rechaza una categoría de otra cuenta y no deja rastro', async () => {
    const deBeto = await crearCategoria(comoBeto, 'Energía');

    await aprender(comoAna, 'Pago Celsia Energía', deBeto.id).expect(422);

    expect(await reglasDe(ana)).toEqual([]);
    expect(await reglasDe(beto)).toEqual([]);
  });

  it('exige el cuerpo completo: sin categoría o sin descripción es 400', async () => {
    await http
      .post('/api/v1/categorization/learn')
      .set('Authorization', comoAna)
      .send({ description: 'Celsia' })
      .expect(400);
    await http
      .post('/api/v1/categorization/learn')
      .set('Authorization', comoAna)
      .send({ category_id: 1 })
      .expect(400);
  });
});
