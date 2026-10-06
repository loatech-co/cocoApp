import { isDuplicateEmail } from './supabase-auth.errors';

/**
 * Qué cuenta como «ese correo ya está registrado».
 *
 * Es la función que decide si una solicitud de acceso se pierde en SILENCIO.
 * Devolver `true` de más significa contestar «recibimos tu solicitud» sin crear
 * nada: ni fila, ni entrada en la bitácora, ni nada que un administrador pueda
 * aprobar. Ya pasó una vez, cuando cualquier 422 se trataba como correo
 * repetido y se tragaba también las contraseñas débiles y los registros
 * deshabilitados.
 *
 * Se exporta justo para esto, y hasta ahora no tenía prueba.
 */
describe('Reconocer un correo ya registrado', () => {
  it('el 409 es un conflicto y no admite otra lectura', () => {
    expect(isDuplicateEmail(409, null)).toBe(true);
  });

  it('reconoce el código que manda GoTrue', () => {
    expect(isDuplicateEmail(422, { error_code: 'email_exists' })).toBe(true);
    expect(isDuplicateEmail(422, { code: 'user_already_exists' })).toBe(true);
    expect(isDuplicateEmail(400, { error_code: 'EMAIL_EXISTS' })).toBe(true);
  });

  it('con código, el código MANDA sobre el texto', () => {
    // Un `msg` que hable de otra cosa no puede contradecir un código explícito.
    expect(
      isDuplicateEmail(422, {
        error_code: 'weak_password',
        msg: 'already been registered',
      }),
    ).toBe(false);
  });

  it('cae al texto solo cuando no vino código', () => {
    expect(
      isDuplicateEmail(422, { msg: 'A user with this email address has already been registered' }),
    ).toBe(true);
    expect(isDuplicateEmail(422, { message: 'Email already exists' })).toBe(true);
    expect(isDuplicateEmail(422, { msg: 'Password is too weak' })).toBe(false);
  });

  it('el código NUMÉRICO de las versiones viejas no tapa el respaldo por texto', () => {
    // GoTrue mandaba `code: 422` —el propio estado— sin `error_code`. Eso no
    // es un código de error, así que el texto sigue decidiendo.
    expect(isDuplicateEmail(422, { code: 422, msg: 'already registered' })).toBe(true);
    expect(isDuplicateEmail(422, { code: 422, msg: 'Signups not allowed' })).toBe(false);
  });

  it('un campo que llega como objeto no se convierte en código', () => {
    // `String({})` da «[object Object]»: una cadena que no coincide con ningún
    // código pero que TAMPOCO está vacía, así que apagaba el respaldo por
    // mensaje y un correo repetido de verdad se contestaba con un 500.
    expect(
      isDuplicateEmail(422, {
        error_code: { detail: 'algo' },
        msg: 'already been registered',
      }),
    ).toBe(true);
  });

  it('lo que no es 409, 422 ni 400 no es un correo repetido', () => {
    // Un 500 o un 401 son otra cosa, y tratarlos como repetido perdería la
    // solicitud sin dejar rastro.
    expect(isDuplicateEmail(500, { msg: 'already been registered' })).toBe(false);
    expect(isDuplicateEmail(401, { error_code: 'email_exists' })).toBe(false);
  });
});
