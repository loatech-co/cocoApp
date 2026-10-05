import request from 'supertest';

import { PASSWORD_VALIDA, correoDePrueba, levantarApp, type EntornoDePruebas } from './helpers/app';

/**
 * El limitador de tasa, encendido de verdad.
 *
 * Vive en su propio archivo porque el resto de la suite lo desactiva: cuenta
 * intentos por minuto y haría fallar pruebas por motivos ajenos a lo que
 * verifican. Aquí se comprueba que sigue vivo, que es lo que importa — sin esta
 * prueba, alguien podría desactivarlo sin querer y nadie se enteraría.
 *
 * Por qué importa: el registro y el login consumen un hash argon2 de 19 MiB por
 * intento. Sin tope, unas pocas peticiones por segundo bastan para dejar la
 * API sin memoria.
 */
describe('Limitador de tasa (e2e)', () => {
  let entorno: EntornoDePruebas;
  let http: ReturnType<typeof request>;

  beforeAll(async () => {
    entorno = await levantarApp({ conLimitador: true });
    http = request(entorno.app.getHttpServer());
  });

  afterAll(async () => {
    await entorno.cerrar();
  });

  it('corta el login al undécimo intento en un minuto', async () => {
    const usuario = await entorno.crearUsuario();

    const estados: number[] = [];
    for (let intento = 0; intento < 11; intento += 1) {
      const respuesta = await http
        .post('/api/v1/auth/login')
        .send({ email: usuario.email, password: 'Zz9$Otra-Cosa-Aqui!' });
      estados.push(respuesta.status);
    }

    // Los diez primeros llegan al servicio (401: credenciales incorrectas).
    expect(estados.slice(0, 10)).toEqual(Array(10).fill(401));
    // El undécimo ni siquiera lo intenta.
    expect(estados[10]).toBe(429);
  });

  it('corta la renovación de sesión al intento 31 en un minuto', async () => {
    // Sin cookie ni token: cada intento llega al controlador y responde 401.
    // Lo que se mide es que el tope de la ruta existe, no la renovación.
    const estados: number[] = [];
    for (let intento = 0; intento < 31; intento += 1) {
      const respuesta = await http.post('/api/v1/auth/refresh').send({});
      estados.push(respuesta.status);
    }

    expect(estados.slice(0, 30)).toEqual(Array(30).fill(401));
    expect(estados[30]).toBe(429);
  });

  it('corta el registro al sexto intento en un minuto', async () => {
    const estados: number[] = [];
    for (let intento = 0; intento < 6; intento += 1) {
      const respuesta = await http.post('/api/v1/auth/register').send({
        email: correoDePrueba('rafaga'),
        password: PASSWORD_VALIDA,
        displayName: 'Ráfaga',
      });
      estados.push(respuesta.status);
    }

    expect(estados.slice(0, 5)).toEqual(Array(5).fill(201));
    expect(estados[5]).toBe(429);
  });

  it('el 429 sale con el envelope canónico de errores', async () => {
    const respuesta = await http
      .post('/api/v1/auth/register')
      .send({ email: correoDePrueba(), password: PASSWORD_VALIDA, displayName: 'X' })
      .expect(429);

    expect(respuesta.body).toEqual({
      error: { code: 'rate_limited', message: expect.any(String), details: [] },
    });
  });
});
