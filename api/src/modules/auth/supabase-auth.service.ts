import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createRemoteJWKSet, jwtVerify } from 'jose';

import { isDuplicateEmail } from './supabase-auth.errors';
import { whyNotTouchRealAccounts } from '../../common/env';
import {
  AuthenticationError,
  ForbiddenError,
  InternalError,
} from '../../common/errors/domain-error';

/**
 * Cliente de Supabase Auth (GoTrue).
 *
 * ── Por qué la API habla con GoTrue y no el navegador ────────────────────────
 * Lo idiomático en Supabase es que el frontend use supabase-js y guarde la
 * sesión en localStorage. Aquí no, por una razón concreta: el refresh token de
 * esta app vive en una cookie httpOnly con SameSite=Strict, y un token en
 * localStorage es legible por cualquier script que logre inyectarse. Para
 * datos financieros esa diferencia importa más que la comodidad.
 *
 * El navegador sigue hablando solo con nuestra API, que traduce a GoTrue. A
 * cambio, Supabase pasa a ser el almacén de credenciales y el emisor de los
 * tokens; nosotros conservamos la aprobación por admin, la bitácora y la
 * revocación inmediata de sesiones.
 *
 * ── Por qué se verifica con JWKS y no con el secreto del proyecto ────────────
 * El proyecto firma con ES256 y publica su clave pública. Verificar contra el
 * JWKS significa que la API no necesita guardar ningún secreto de firma, y que
 * una rotación de claves en Supabase no exige redespliegue: jose cachea el
 * conjunto y lo revalida solo.
 */
@Injectable()
export class SupabaseAuthService {
  private readonly logger = new Logger(SupabaseAuthService.name);
  private readonly url: string;
  private readonly anonKey: string;
  private readonly serviceKey: string;
  private readonly jwks: ReturnType<typeof createRemoteJWKSet>;
  private readonly issuer: string;

  constructor(config: ConfigService) {
    this.url = requireSetting(config, 'SUPABASE_URL').replace(/\/+$/, '');
    this.anonKey = requireSetting(config, 'SUPABASE_ANON_KEY');
    this.serviceKey = requireSetting(config, 'SUPABASE_SERVICE_ROLE_KEY');
    this.issuer = `${this.url}/auth/v1`;
    this.jwks = createRemoteJWKSet(new URL(`${this.issuer}/.well-known/jwks.json`));
  }

  // ── Verificación ───────────────────────────────────────────────────────────

  /**
   * Comprueba la firma y devuelve lo mínimo que necesita el guard.
   *
   * `iat` se devuelve en MILISEGUNDOS aunque el JWT lo traiga en segundos: el
   * guard lo compara contra `sessionsValidFrom`, que es un Date. Mezclar las
   * dos unidades daría por válido cualquier token emitido en los últimos 54
   * años, que es exactamente el fallo que uno no detecta en pruebas.
   */
  async verifyAccessToken(
    token: string,
  ): Promise<{ authId: string; email: string; iatMs: number }> {
    try {
      const { payload } = await jwtVerify(token, this.jwks, {
        issuer: this.issuer,
        audience: 'authenticated',
      });

      if (!payload.sub || typeof payload.iat !== 'number') {
        throw new Error('el token no trae sub o iat');
      }

      return {
        authId: payload.sub,
        email: typeof payload.email === 'string' ? payload.email : '',
        iatMs: payload.iat * 1000,
      };
    } catch {
      // Sin detalles a propósito: distinguir "firma inválida" de "expirado" o
      // "emisor equivocado" solo ayuda a quien está probando tokens.
      throw new AuthenticationError('Token inválido o expirado.', { code: 'invalid_token' });
    }
  }

  // ── Sesiones ───────────────────────────────────────────────────────────────

  /** Canjea correo y contraseña por una sesión. `null` si no son válidos. */
  async signIn(email: string, password: string): Promise<SupabaseSession | null> {
    const response = await this.call('POST', '/token?grant_type=password', {
      body: { email, password },
      key: this.anonKey,
    });

    if (response.status === 400 || response.status === 401) return null;
    return this.toSession(response);
  }

  /** Canjea un refresh token por una sesión nueva. `null` si ya no sirve. */
  async refresh(refreshToken: string): Promise<SupabaseSession | null> {
    const response = await this.call('POST', '/token?grant_type=refresh_token', {
      body: { refresh_token: refreshToken },
      key: this.anonKey,
    });

    if (response.status === 400 || response.status === 401) return null;
    return this.toSession(response);
  }

  /**
   * Revoca en Supabase la sesión a la que pertenece este refresh token.
   *
   * Hace falta canjearlo primero porque `/logout` se autentica con el ACCESS
   * token, no con el refresh. Si el canje falla, la sesión ya estaba muerta y
   * no hay nada que revocar.
   */
  async signOut(refreshToken: string): Promise<void> {
    const session = await this.refresh(refreshToken);
    if (!session) return;

    await this.call('POST', '/logout?scope=local', {
      key: this.anonKey,
      authorization: session.accessToken,
    });
  }

  /** Revoca TODAS las sesiones de la persona en Supabase. */
  async signOutEverywhere(authId: string): Promise<void> {
    // El endpoint de administración acepta el id y corta todas las familias de
    // refresh tokens de esa cuenta de una vez.
    await this.call('POST', `/admin/users/${authId}/logout`, { key: this.serviceKey });
  }

  // ── Administración de cuentas ──────────────────────────────────────────────

  /**
   * Crea la cuenta en Supabase y devuelve su id, o `null` si el correo ya
   * estaba registrado.
   *
   * Se usa el endpoint de ADMINISTRACIÓN, no `/signup`, por dos motivos: deja
   * marcar el correo como confirmado sin depender del SMTP del plan gratuito
   * —limitado a unos pocos envíos por hora—, y evita que `/signup` devuelva ya
   * una sesión, cuando aquí toda cuenta nueva nace pendiente de aprobación y
   * no debe poder entrar todavía.
   */
  /**
   * Devuelve el `id` de Supabase, o `null` si ese correo YA estaba registrado.
   *
   * ── El `null` significa una cosa y solo una ─────────────────────────────
   * Quien llama traduce ese `null` a «tu solicitud quedó pendiente» sin crear
   * nada, porque para un correo que ya existe eso es justo lo correcto: no se
   * confirma ni se desmiente que la cuenta esté, y el usuario legítimo espera
   * igual que esperaría.
   *
   * Lo que NO puede es significar «pasó algo raro». Antes cualquier 422 volvía
   * como `null`, y GoTrue contesta 422 a varias cosas distintas: el correo ya
   * registrado, sí, pero también una contraseña que no pasa SU política —que
   * es otra que la nuestra—, un correo con formato inválido y los registros
   * deshabilitados en el proyecto. En todos esos casos la solicitud se perdía
   * en silencio: quien la mandaba leía «Recibimos tu solicitud», no se creaba
   * ninguna fila, no se escribía nada en la bitácora, y el administrador no
   * tenía nada que aprobar ni forma de enterarse. Si la política de Supabase
   * era más estricta que la nuestra, eso les pasaba a TODOS.
   *
   * Ahora solo el correo repetido vuelve como `null`. Lo demás revienta con
   * 500, que es lo que es: quien solicita ve que algo falló y puede reintentar
   * o avisar, y el registro del servidor dice qué contestó Supabase.
   */
  async createUser(email: string, password: string): Promise<string | null> {
    const response = await this.call('POST', '/admin/users', {
      body: { email, password, email_confirm: true },
      key: this.serviceKey,
    });

    if (isDuplicateEmail(response.status, response.data)) return null;
    if (response.status >= 400) this.fail(response, 'crear el usuario');

    const id = response.data?.id;
    if (typeof id !== 'string') this.fail(response, 'crear el usuario');
    return id;
  }

  async changePassword(authId: string, newPassword: string): Promise<void> {
    const response = await this.call('PUT', `/admin/users/${authId}`, {
      body: { password: newPassword },
      key: this.serviceKey,
    });
    if (response.status >= 400) this.fail(response, 'cambiar la contraseña');
  }

  async deleteUser(authId: string): Promise<void> {
    await this.call('DELETE', `/admin/users/${authId}`, { key: this.serviceKey });
  }

  /** Comprueba una contraseña sin abrir sesión, para reautenticar. */
  async isPasswordCorrect(email: string, password: string): Promise<boolean> {
    const session = await this.signIn(email, password);
    if (!session) return false;
    // La sesión se descarta: solo interesaba la comprobación. Dejarla viva
    // sería una sesión que nadie pidió y que nadie va a cerrar.
    await this.call('POST', '/logout?scope=local', {
      key: this.anonKey,
      authorization: session.accessToken,
    });
    return true;
  }

  // ── Plomería ───────────────────────────────────────────────────────────────

  private async call(
    method: 'GET' | 'POST' | 'PUT' | 'DELETE',
    path: string,
    options: { body?: unknown; key: string; authorization?: string },
  ): Promise<SupabaseReply> {
    /*
      El candado de las cuentas reales va AQUÍ, y no en los cuatro métodos.

      Las cuatro operaciones que alcanzan una cuenta de verdad —crear, borrar,
      cambiar la contraseña, cerrar todas las sesiones— comparten una marca que
      no es casual: todas pegan contra `/admin/` con la clave de servicio.
      Comprobarlo en el punto por el que pasan todas significa que una quinta
      escrita mañana nace protegida, sin que nadie tenga que acordarse.

      Escrito cuatro veces sería la cuarta copia la que se olvidaría: es
      exactamente lo que pasó con el bloqueo de los centros estáticos, que se
      cayó al rediseñar la ficha porque vivía repetido en dos sitios.

      Entrar, refrescar y cerrar LA sesión propia no pasan por aquí: usan la
      clave anónima y rutas que no son de administración. Así la aplicación se
      sigue pudiendo usar en local, que es el objetivo.
    */
    if (path.startsWith('/admin/')) {
      const blocker = whyNotTouchRealAccounts();
      if (blocker !== null) {
        this.logger.warn(`Operación de administración bloqueada: ${method} ${path}`);
        throw new ForbiddenError(blocker, { code: 'real_accounts_protected' });
      }
    }

    const headers: Record<string, string> = {
      apikey: options.key,
      Authorization: `Bearer ${options.authorization ?? options.key}`,
    };
    if (options.body !== undefined) headers['Content-Type'] = 'application/json';

    let response: Response;
    try {
      response = await fetch(`${this.issuer}${path}`, {
        method,
        headers,
        ...(options.body !== undefined && { body: JSON.stringify(options.body) }),
        signal: AbortSignal.timeout(15_000),
      });
    } catch (error) {
      // La base y el proveedor de identidad ahora son servicios distintos: uno
      // puede estar caído con el otro sano. Se distingue del "credenciales
      // incorrectas" porque la respuesta al usuario no es la misma.
      this.logger.error(`Supabase Auth no respondió: ${(error as Error).message}`);
      throw new InternalError('El servicio de identidad no está disponible.', {
        code: 'identity_provider_failed',
      });
    }

    const text = await response.text();
    let data: Record<string, unknown> | null;
    try {
      data = text ? (JSON.parse(text) as Record<string, unknown>) : null;
    } catch {
      data = null;
    }

    return { status: response.status, data };
  }

  private toSession(response: SupabaseReply): SupabaseSession {
    const d = response.data;
    const accessToken = d?.access_token;
    const refreshToken = d?.refresh_token;
    const user = d?.user as { id?: string; email?: string } | undefined;

    if (typeof accessToken !== 'string' || typeof refreshToken !== 'string' || !user?.id) {
      this.fail(response, 'abrir la sesión');
    }

    return {
      accessToken,
      refreshToken,
      expiresIn: typeof d?.expires_in === 'number' ? d.expires_in : 3600,
      authId: user.id,
      email: user.email ?? '',
    };
  }

  private fail(response: SupabaseReply, action: string): never {
    const detail = response.data?.msg ?? response.data?.message ?? 'sin detalle';
    this.logger.error(
      `Supabase Auth falló al ${action}: ${response.status} ${typeof detail === 'string' ? detail : JSON.stringify(detail)}`,
    );
    throw new InternalError(`No se pudo ${action}.`, { code: 'identity_provider_failed' });
  }
}

export interface SupabaseSession {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  authId: string;
  email: string;
}

interface SupabaseReply {
  status: number;
  data: Record<string, unknown> | null;
}

/**
 * ¿Esta respuesta de GoTrue dice «ese correo ya está registrado»?
 *
 * ── Por qué no basta con mirar el código de estado ──────────────────────────
 * Porque 422 no identifica nada por sí solo. GoTrue lo usa para el correo
 * repetido, para una contraseña que no pasa su política, para un correo con
 * formato inválido y para los registros deshabilitados. Tratarlos a todos
 * igual era perder solicitudes sin dejar rastro.
 *
 * ── Qué se mira, y en este orden ────────────────────────────────────────────
 * 1. `409`, que es el conflicto de toda la vida y no admite otra lectura.
 * 2. `error_code` o `code`, que es lo que GoTrue trae desde 2024 y es dato,
 *    no prosa: `email_exists` (crear) y `user_already_exists` (invitar).
 * 3. El texto del mensaje, para las versiones anteriores, que solo mandaban
 *    `msg`. Va el ÚLTIMO a propósito: leer prosa para decidir es frágil —una
 *    traducción o una reescritura de GoTrue la rompe— y por eso es el
 *    respaldo y no el criterio.
 *
 * Es una función suelta y exportada para poder probarla con las respuestas de
 * verdad, sin levantar el servicio ni tocar la red.
 */
function requireSetting(config: ConfigService, key: string): string {
  const value = config.get<string>(key)?.trim();
  if (!value) {
    throw new Error(`Falta ${key}. Sin ella la autenticación no puede funcionar.`);
  }
  return value;
}
