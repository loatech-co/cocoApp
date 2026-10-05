import { ForbiddenException, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { User } from '@prisma/client';

import { PasswordService } from './password.service';
import { SupabaseAuthService } from './supabase-auth.service';
import { AuditService } from '../../common/audit/audit.service';
import { PrismaService } from '../../prisma/prisma.service';
import { sembrarPlantilla } from '../categories/categories.plantilla';

export interface ContextoDePeticion {
  ip?: string | undefined;
  userAgent?: string | undefined;
}

export interface PerfilPublico {
  id: bigint;
  email: string;
  display_name: string | null;
  role: User['role'];
  status: User['status'];
  created_at: Date;
}

/** Lo que el controlador necesita para responder y poner la cookie. */
export interface ParDeTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

/**
 * Autenticación de la app.
 *
 * ── Reparto de responsabilidades tras migrar a Supabase Auth ────────────────
 * Supabase guarda las credenciales, las verifica, y emite y rota los tokens.
 * Aquí se queda todo lo que es del PRODUCTO y que Supabase no modela:
 *
 *   · La aprobación por un admin. Toda cuenta nace `pending` y no entra hasta
 *     que alguien la activa. Supabase daría por buena cualquier cuenta con el
 *     correo confirmado.
 *   · La bitácora. Cada entrada, salida y fallo queda registrado con IP y
 *     agente, que en una app de finanzas es parte del producto.
 *   · La revocación inmediata, vía `sessions_valid_from`.
 *   · La política de contraseñas, que es más exigente que la de Supabase.
 *
 * Lo que SÍ se perdió y conviene saber: la resistencia a ataques de tiempo del
 * login. Antes se gastaba un argon2 equivalente cuando el correo no existía,
 * para que la duración de la respuesta no delatara qué correos tienen cuenta.
 * Ahora la verificación ocurre dentro de Supabase y ese control ya no es
 * nuestro. En el registro sí se conserva el equivalente: se llama siempre a
 * Supabase, exista o no el correo, y la respuesta es idéntica en ambos casos.
 */
@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly correoDelAdminInicial: string | null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly supabase: SupabaseAuthService,
    private readonly passwords: PasswordService,
    private readonly audit: AuditService,
    config: ConfigService,
  ) {
    this.correoDelAdminInicial =
      config.get<string>('BOOTSTRAP_ADMIN_EMAIL')?.trim().toLowerCase() || null;
  }

  // ── Registro ───────────────────────────────────────────────────────────────

  /**
   * Crea la cuenta en Supabase y su perfil aquí, en estado `pending`.
   *
   * Devuelve SIEMPRE el mismo resultado, exista o no el correo. Responder "ese
   * correo ya está registrado" convertiría este endpoint en un oráculo para
   * averiguar quién tiene cuenta. Como toda cuenta queda a la espera de
   * aprobación, el usuario legítimo no pierde nada: en ambos casos espera.
   *
   * La excepción es `BOOTSTRAP_ADMIN_EMAIL`, que nace admin y activo. Se hace
   * así, y no "el primer registro gana", porque si la app estuviera desplegada
   * antes de que el dueño se registre, cualquiera se llevaría el panel.
   */
  async registrar(
    datos: { email: string; password: string; displayName: string },
    contexto: ContextoDePeticion,
  ): Promise<{ pendienteDeAprobacion: boolean }> {
    const email = normalizarCorreo(datos.email);
    const displayName = datos.displayName.trim();

    // La política se valida SIEMPRE, antes de mirar si el correo existe: si
    // solo se validara para correos nuevos, el tiempo de respuesta los delataría.
    await this.passwords.exigirQueSeaFuerte(datos.password, { email, displayName });

    // Se llama a Supabase exista o no el correo, para que la duración de la
    // respuesta sea la misma en ambos casos. Devuelve null si ya existía.
    const authId = await this.supabase.crearUsuario(email, datos.password);

    if (!authId) {
      this.logger.warn('Intento de registro sobre un correo ya existente.');
      return { pendienteDeAprobacion: true };
    }

    const esAdminInicial = this.correoDelAdminInicial === email;

    const usuario = await this.prisma.user.create({
      data: {
        authId,
        email,
        displayName,
        role: esAdminInicial ? 'admin' : 'user',
        status: esAdminInicial ? 'active' : 'pending',
        approvedAt: esAdminInicial ? new Date() : null,
        // Explícito, no por DEFAULT del motor. El guard compara este valor
        // contra el `iat` del token que emite Supabase; si uno lo pusiera el
        // reloj de Postgres y el otro el de Supabase, un desfase de
        // milisegundos entre relojes invalidaría sesiones legítimas.
        sessionsValidFrom: alSegundo(new Date()),
      },
    });

    /*
      ── La cuenta nace con su estructura ──────────────────────────────────
      Los centros de costos son de cada cuenta y no se comparten, así que una
      cuenta recién creada no tiene NINGUNO: al entrar, Centros de costos
      estaba vacío y la ficha de un movimiento no tenía dónde clasificar nada.
      Se copia la plantilla —los dos primeros niveles, congelados— y desde ese
      momento el árbol es suyo.

      Se hace aquí y no al aprobar porque la fila ya existe aquí, y porque una
      cuenta rechazada se lleva sus categorías por delante con el borrado en
      cascada: no queda nada suelto.

      ── Y si falla, la cuenta se crea igual ───────────────────────────────
      Sembrar es una comodidad; registrarse es la operación. Reventar aquí
      dejaría a la persona con su usuario ya creado en Supabase —así que
      reintentar no serviría de nada, el correo «ya existe»— y sin perfil, que
      es el único estado del que no se sale solo. El árbol se puede rellenar
      después desde `POST /categories/seed`.
    */
    try {
      await sembrarPlantilla(this.prisma, usuario.id);
    } catch (error) {
      this.logger.error(
        `No se pudo sembrar la plantilla de la cuenta ${usuario.id}: ${(error as Error).message}`,
      );
    }

    await this.audit.registrar({
      userId: usuario.id,
      entity: 'users',
      entityId: usuario.id,
      action: 'auth.register',
      changes: { role: usuario.role, status: usuario.status },
      ip: contexto.ip,
      userAgent: contexto.userAgent,
    });

    return { pendienteDeAprobacion: usuario.status === 'pending' };
  }

  // ── Login ──────────────────────────────────────────────────────────────────

  /**
   * Verifica credenciales contra Supabase y abre sesión.
   *
   * Orden deliberado: primero la contraseña, DESPUÉS el estado de la cuenta.
   * Así los mensajes específicos ("pendiente de aprobación", "suspendida")
   * solo los ve quien ya demostró conocer la contraseña. Al revés, cualquiera
   * podría averiguar qué correos tienen cuenta.
   */
  async entrar(
    datos: { email: string; password: string },
    contexto: ContextoDePeticion,
  ): Promise<{ tokens: ParDeTokens; perfil: PerfilPublico }> {
    const email = normalizarCorreo(datos.email);
    const sesion = await this.supabase.entrar(email, datos.password);

    if (!sesion) {
      await this.audit.registrar({
        entity: 'users',
        action: 'auth.login_failed',
        changes: { motivo: 'credenciales_incorrectas' },
        ip: contexto.ip,
        userAgent: contexto.userAgent,
      });
      throw new UnauthorizedException('Correo o contraseña incorrectos.');
    }

    const usuario = await this.prisma.user.findUnique({ where: { authId: sesion.authId } });

    if (!usuario) {
      // La cuenta existe en Supabase pero no tiene perfil aquí. Pasa si se creó
      // desde el panel de Supabase saltándose el registro de la app. Sin perfil
      // no hay rol ni estado, así que no se puede autorizar nada.
      this.logger.error(`Cuenta de Supabase ${sesion.authId} sin perfil en la aplicación.`);
      throw new ForbiddenException('Tu cuenta no está habilitada. Contacta al administrador.');
    }

    this.exigirCuentaUsable(usuario);

    // Si la marca de revocación quedó por delante del token que Supabase acaba
    // de emitir, se baja hasta él. Pasa al volver a entrar en el mismo segundo
    // en que se cerraron todas las sesiones: sin esto, el login parecería
    // correcto y la siguiente petición daría 401.
    //
    // Bajarla solo puede revivir tokens emitidos en ESE segundo, y solo cuando
    // alguien acaba de demostrar que conoce la contraseña. Lo anterior a ese
    // segundo sigue muerto.
    const inicioDeSesion = new Date(Math.floor(Date.now() / 1000) * 1000);
    const marca =
      usuario.sessionsValidFrom > inicioDeSesion ? inicioDeSesion : usuario.sessionsValidFrom;

    const actualizado = await this.prisma.user.update({
      where: { id: usuario.id },
      data: { lastLoginAt: new Date(), sessionsValidFrom: marca },
    });

    await this.audit.registrar({
      userId: actualizado.id,
      entity: 'users',
      entityId: actualizado.id,
      action: 'auth.login',
      ip: contexto.ip,
      userAgent: contexto.userAgent,
    });

    return { tokens: aParDeTokens(sesion), perfil: aPerfilPublico(actualizado) };
  }

  // ── Sesión ─────────────────────────────────────────────────────────────────

  async refrescar(
    refreshToken: string,
    _contexto: ContextoDePeticion,
  ): Promise<{ tokens: ParDeTokens; perfil: PerfilPublico }> {
    const sesion = await this.supabase.refrescar(refreshToken);
    if (!sesion) throw new UnauthorizedException('La sesión expiró. Vuelve a entrar.');

    const usuario = await this.prisma.user.findUnique({ where: { authId: sesion.authId } });
    if (!usuario) throw new UnauthorizedException('La sesión ya no es válida.');

    // El estado se revisa también al refrescar: si suspenden una cuenta, no
    // debe poder estirar su sesión indefinidamente cambiando un token por otro.
    //
    // Aquí es 401 y no 403, a diferencia del login. En el login la persona
    // acaba de demostrar que sabe la contraseña y merece saber POR QUÉ no
    // entra. En el refresco no hay nadie mirando: es el cliente renovando en
    // segundo plano, y un 401 le dice "esta sesión murió, mandá a entrar de
    // nuevo". Un 403 lo dejaría reintentando contra una sesión que no va a
    // revivir.
    if (usuario.status !== 'active') {
      throw new UnauthorizedException('La sesión ya no es válida.');
    }

    return { tokens: aParDeTokens(sesion), perfil: aPerfilPublico(usuario) };
  }

  async salir(refreshToken: string | undefined, contexto: ContextoDePeticion): Promise<void> {
    if (!refreshToken) return;

    const sesion = await this.supabase.refrescar(refreshToken);
    await this.supabase.cerrarSesion(refreshToken);

    if (!sesion) return;
    const usuario = await this.prisma.user.findUnique({ where: { authId: sesion.authId } });
    if (!usuario) return;

    await this.audit.registrar({
      userId: usuario.id,
      entity: 'users',
      entityId: usuario.id,
      action: 'auth.logout',
      ip: contexto.ip,
      userAgent: contexto.userAgent,
    });
  }

  /** Cierra sesión en todos los dispositivos, de inmediato. */
  async salirDeTodoslosDispositivos(userId: bigint, contexto: ContextoDePeticion): Promise<void> {
    await this.revocarTodasLasSesiones(userId);
    await this.audit.registrar({
      userId,
      entity: 'users',
      entityId: userId,
      action: 'auth.logout_all',
      ip: contexto.ip,
      userAgent: contexto.userAgent,
    });
  }

  // ── Contraseña ─────────────────────────────────────────────────────────────

  /**
   * Cambio de contraseña por el propio usuario.
   *
   * Exige la actual: si bastara el access token, quien robara uno podría
   * apoderarse de la cuenta cambiándola. Al terminar cierra todas las sesiones
   * — incluida la del atacante, si la hubiera.
   */
  async cambiarContrasena(
    userId: bigint,
    datos: { actual: string; nueva: string },
    contexto: ContextoDePeticion,
  ): Promise<void> {
    const usuario = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (!usuario.authId) {
      throw new ForbiddenException('Esta cuenta no tiene credenciales gestionadas.');
    }

    if (!(await this.supabase.contrasenaEsCorrecta(usuario.email, datos.actual))) {
      throw new UnauthorizedException('La contraseña actual no es correcta.');
    }

    await this.passwords.exigirQueSeaFuerte(datos.nueva, {
      email: usuario.email,
      displayName: usuario.displayName ?? undefined,
    });

    await this.supabase.cambiarContrasena(usuario.authId, datos.nueva);
    await this.revocarTodasLasSesiones(userId);

    await this.audit.registrar({
      userId,
      entity: 'users',
      entityId: userId,
      action: 'auth.password_changed',
      ip: contexto.ip,
      userAgent: contexto.userAgent,
    });
  }

  async perfilDe(userId: bigint): Promise<PerfilPublico> {
    return aPerfilPublico(await this.prisma.user.findUniqueOrThrow({ where: { id: userId } }));
  }

  // ── Interno ────────────────────────────────────────────────────────────────

  /**
   * Corta las sesiones por los DOS lados.
   *
   * `sessionsValidFrom` surte efecto en la siguiente petición sin salir a la
   * red, y es lo que hace que suspender una cuenta sea instantáneo. Revocar
   * además en Supabase es lo que impide que un refresh token robado siga
   * canjeándose por tokens nuevos. Hacer solo una de las dos deja un agujero:
   * la primera sin la segunda permite refrescar para siempre; la segunda sin la
   * primera deja vivo el access token actual hasta que expire.
   */
  async revocarTodasLasSesiones(userId: bigint): Promise<void> {
    const usuario = await this.prisma.user.update({
      where: { id: userId },
      data: { sessionsValidFrom: alSegundoSiguiente(new Date()) },
    });

    if (usuario.authId) {
      await this.supabase.cerrarTodasLasSesiones(usuario.authId);
    }
  }

  private exigirCuentaUsable(usuario: User): void {
    if (usuario.status === 'pending') {
      throw new ForbiddenException(
        'Tu cuenta está pendiente de aprobación. Te avisaremos cuando esté lista.',
      );
    }
    if (usuario.status === 'suspended') {
      throw new ForbiddenException('Tu cuenta está suspendida. Contacta al administrador.');
    }
  }
}

/** Minúsculas y sin espacios: `Gerardo@X.com ` y `gerardo@x.com` son la misma cuenta. */
function normalizarCorreo(email: string): string {
  return email.trim().toLowerCase();
}

export function aPerfilPublico(usuario: User): PerfilPublico {
  return {
    id: usuario.id,
    email: usuario.email,
    display_name: usuario.displayName,
    role: usuario.role,
    status: usuario.status,
    created_at: usuario.createdAt,
  };
}

/**
 * Recorta un instante al segundo. Toda comparación con `sessionsValidFrom` se
 * hace en esta unidad porque el `iat` de un JWT no tiene más precisión: si aquí
 * se guardaran milisegundos, un token emitido en el mismo segundo parecería
 * ANTERIOR a su propia sesión y el guard lo rechazaría nada más nacer.
 */
function alSegundo(momento: Date): Date {
  return new Date(Math.floor(momento.getTime() / 1000) * 1000);
}

/**
 * El primer instante que una sesión nueva puede tener para considerarse
 * posterior a una revocación: el segundo SIGUIENTE.
 *
 * Apuntar al segundo en curso dejaría vivos los tokens emitidos en ese mismo
 * segundo —justo la ventana que necesita alguien con un token robado—, así que
 * se redondea hacia arriba. El precio es un borde de menos de un segundo al
 * volver a entrar, que `entrar` resuelve.
 */
function alSegundoSiguiente(momento: Date): Date {
  return new Date(Math.floor(momento.getTime() / 1000) * 1000 + 1000);
}

function aParDeTokens(sesion: {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}): ParDeTokens {
  return {
    accessToken: sesion.accessToken,
    refreshToken: sesion.refreshToken,
    expiresIn: sesion.expiresIn,
  };
}
