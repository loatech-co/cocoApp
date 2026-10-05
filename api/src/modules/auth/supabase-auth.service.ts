import {
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createRemoteJWKSet, jwtVerify } from 'jose';

import { porQueNoTocarCuentasReales } from '../../common/entorno';
import { esCorreoRepetido } from './supabase-auth.errores';

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
  private readonly emisor: string;

  constructor(config: ConfigService) {
    this.url = exigir(config, 'SUPABASE_URL').replace(/\/+$/, '');
    this.anonKey = exigir(config, 'SUPABASE_ANON_KEY');
    this.serviceKey = exigir(config, 'SUPABASE_SERVICE_ROLE_KEY');
    this.emisor = `${this.url}/auth/v1`;
    this.jwks = createRemoteJWKSet(new URL(`${this.emisor}/.well-known/jwks.json`));
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
  async verificarAccessToken(
    token: string,
  ): Promise<{ authId: string; email: string; iatMs: number }> {
    try {
      const { payload } = await jwtVerify(token, this.jwks, {
        issuer: this.emisor,
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
      throw new UnauthorizedException('Token inválido o expirado.');
    }
  }

  // ── Sesiones ───────────────────────────────────────────────────────────────

  /** Canjea correo y contraseña por una sesión. `null` si no son válidos. */
  async entrar(email: string, password: string): Promise<SesionDeSupabase | null> {
    const respuesta = await this.llamar('POST', '/token?grant_type=password', {
      cuerpo: { email, password },
      clave: this.anonKey,
    });

    if (respuesta.estado === 400 || respuesta.estado === 401) return null;
    return this.aSesion(respuesta);
  }

  /** Canjea un refresh token por una sesión nueva. `null` si ya no sirve. */
  async refrescar(refreshToken: string): Promise<SesionDeSupabase | null> {
    const respuesta = await this.llamar('POST', '/token?grant_type=refresh_token', {
      cuerpo: { refresh_token: refreshToken },
      clave: this.anonKey,
    });

    if (respuesta.estado === 400 || respuesta.estado === 401) return null;
    return this.aSesion(respuesta);
  }

  /**
   * Revoca en Supabase la sesión a la que pertenece este refresh token.
   *
   * Hace falta canjearlo primero porque `/logout` se autentica con el ACCESS
   * token, no con el refresh. Si el canje falla, la sesión ya estaba muerta y
   * no hay nada que revocar.
   */
  async cerrarSesion(refreshToken: string): Promise<void> {
    const sesion = await this.refrescar(refreshToken);
    if (!sesion) return;

    await this.llamar('POST', '/logout?scope=local', {
      clave: this.anonKey,
      autorizacion: sesion.accessToken,
    });
  }

  /** Revoca TODAS las sesiones de la persona en Supabase. */
  async cerrarTodasLasSesiones(authId: string): Promise<void> {
    // El endpoint de administración acepta el id y corta todas las familias de
    // refresh tokens de esa cuenta de una vez.
    await this.llamar('POST', `/admin/users/${authId}/logout`, { clave: this.serviceKey });
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
  async crearUsuario(email: string, password: string): Promise<string | null> {
    const respuesta = await this.llamar('POST', '/admin/users', {
      cuerpo: { email, password, email_confirm: true },
      clave: this.serviceKey,
    });

    if (esCorreoRepetido(respuesta.estado, respuesta.datos)) return null;
    if (respuesta.estado >= 400) this.reventar(respuesta, 'crear el usuario');

    const id = respuesta.datos?.id;
    if (typeof id !== 'string') this.reventar(respuesta, 'crear el usuario');
    return id;
  }

  async cambiarContrasena(authId: string, nueva: string): Promise<void> {
    const respuesta = await this.llamar('PUT', `/admin/users/${authId}`, {
      cuerpo: { password: nueva },
      clave: this.serviceKey,
    });
    if (respuesta.estado >= 400) this.reventar(respuesta, 'cambiar la contraseña');
  }

  async eliminarUsuario(authId: string): Promise<void> {
    await this.llamar('DELETE', `/admin/users/${authId}`, { clave: this.serviceKey });
  }

  /** Comprueba una contraseña sin abrir sesión, para reautenticar. */
  async contrasenaEsCorrecta(email: string, password: string): Promise<boolean> {
    const sesion = await this.entrar(email, password);
    if (!sesion) return false;
    // La sesión se descarta: solo interesaba la comprobación. Dejarla viva
    // sería una sesión que nadie pidió y que nadie va a cerrar.
    await this.llamar('POST', '/logout?scope=local', {
      clave: this.anonKey,
      autorizacion: sesion.accessToken,
    });
    return true;
  }

  // ── Plomería ───────────────────────────────────────────────────────────────

  private async llamar(
    metodo: 'GET' | 'POST' | 'PUT' | 'DELETE',
    ruta: string,
    opciones: { cuerpo?: unknown; clave: string; autorizacion?: string },
  ): Promise<Respuesta> {
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
    if (ruta.startsWith('/admin/')) {
      const impedimento = porQueNoTocarCuentasReales();
      if (impedimento !== null) {
        this.logger.warn(`Operación de administración bloqueada: ${metodo} ${ruta}`);
        throw new ForbiddenException(impedimento);
      }
    }

    const cabeceras: Record<string, string> = {
      apikey: opciones.clave,
      Authorization: `Bearer ${opciones.autorizacion ?? opciones.clave}`,
    };
    if (opciones.cuerpo !== undefined) cabeceras['Content-Type'] = 'application/json';

    let respuesta: Response;
    try {
      respuesta = await fetch(`${this.emisor}${ruta}`, {
        method: metodo,
        headers: cabeceras,
        ...(opciones.cuerpo !== undefined && { body: JSON.stringify(opciones.cuerpo) }),
        signal: AbortSignal.timeout(15_000),
      });
    } catch (error) {
      // La base y el proveedor de identidad ahora son servicios distintos: uno
      // puede estar caído con el otro sano. Se distingue del "credenciales
      // incorrectas" porque la respuesta al usuario no es la misma.
      this.logger.error(`Supabase Auth no respondió: ${(error as Error).message}`);
      throw new InternalServerErrorException('El servicio de identidad no está disponible.');
    }

    const texto = await respuesta.text();
    let datos: Record<string, unknown> | null = null;
    try {
      datos = texto ? (JSON.parse(texto) as Record<string, unknown>) : null;
    } catch {
      datos = null;
    }

    return { estado: respuesta.status, datos };
  }

  private aSesion(respuesta: Respuesta): SesionDeSupabase {
    const d = respuesta.datos;
    const accessToken = d?.access_token;
    const refreshToken = d?.refresh_token;
    const usuario = d?.user as { id?: string; email?: string } | undefined;

    if (typeof accessToken !== 'string' || typeof refreshToken !== 'string' || !usuario?.id) {
      this.reventar(respuesta, 'abrir la sesión');
    }

    return {
      accessToken,
      refreshToken,
      expiresIn: typeof d?.expires_in === 'number' ? d.expires_in : 3600,
      authId: usuario.id,
      email: usuario.email ?? '',
    };
  }

  private reventar(respuesta: Respuesta, quehacer: string): never {
    const detalle =
      (respuesta.datos?.msg as string) ?? (respuesta.datos?.message as string) ?? 'sin detalle';
    this.logger.error(`Supabase Auth falló al ${quehacer}: ${respuesta.estado} ${detalle}`);
    throw new InternalServerErrorException(`No se pudo ${quehacer}.`);
  }
}

export interface SesionDeSupabase {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  authId: string;
  email: string;
}

interface Respuesta {
  estado: number;
  datos: Record<string, unknown> | null;
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
function exigir(config: ConfigService, clave: string): string {
  const valor = config.get<string>(clave)?.trim();
  if (!valor) {
    throw new Error(`Falta ${clave}. Sin ella la autenticación no puede funcionar.`);
  }
  return valor;
}
