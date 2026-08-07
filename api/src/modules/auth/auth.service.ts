import {
  ForbiddenException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { User } from '@prisma/client';

import { AuditService } from '../../common/audit/audit.service';
import { PrismaService } from '../../prisma/prisma.service';
import { PasswordService } from './password.service';
import { TokenService, type ParDeTokens } from './token.service';

export interface ContextoDePeticion {
  ip?: string;
  userAgent?: string;
}

export interface PerfilPublico {
  id: bigint;
  email: string;
  display_name: string | null;
  role: User['role'];
  status: User['status'];
  created_at: Date;
}

/** A partir de este número de fallos empieza el retraso progresivo. */
const FALLOS_ANTES_DE_RETRASO = 5;
const RETRASO_MAXIMO_MS = 15 * 60 * 1000;

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly correoDelAdminInicial: string | null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
    private readonly tokens: TokenService,
    private readonly audit: AuditService,
    config: ConfigService,
  ) {
    this.correoDelAdminInicial =
      config.get<string>('BOOTSTRAP_ADMIN_EMAIL')?.trim().toLowerCase() || null;
  }

  // ── Registro ───────────────────────────────────────────────────────────────

  /**
   * Crea una cuenta en estado `pending`.
   *
   * Devuelve SIEMPRE el mismo resultado, exista o no el correo. Responder
   * "ese correo ya está registrado" convertiría este endpoint en un oráculo
   * para averiguar quién tiene cuenta. Como toda cuenta queda a la espera de
   * aprobación, el usuario legítimo no pierde nada: en ambos casos espera.
   *
   * La excepción es el correo de `BOOTSTRAP_ADMIN_EMAIL`, que nace admin y
   * activo. Se hace así, y no "el primer registro gana", porque si la app
   * estuviera desplegada antes de que el dueño se registre, cualquiera se
   * llevaría el panel de administración.
   */
  async registrar(
    datos: { email: string; password: string; displayName: string },
    contexto: ContextoDePeticion,
  ): Promise<{ pendienteDeAprobacion: boolean }> {
    const email = normalizarCorreo(datos.email);
    const displayName = datos.displayName.trim();

    // La política se valida SIEMPRE, incluso si el correo ya existe: si solo se
    // validara para correos nuevos, el tiempo de respuesta delataría cuáles lo son.
    await this.passwords.exigirQueSeaFuerte(datos.password, { email, displayName });

    const yaExiste = await this.prisma.user.findUnique({ where: { email } });

    if (!yaExiste) {
      const esAdminInicial = this.correoDelAdminInicial === email;

      const usuario = await this.prisma.user.create({
        data: {
          email,
          displayName,
          passwordHash: await this.passwords.hashear(datos.password),
          role: esAdminInicial ? 'admin' : 'user',
          status: esAdminInicial ? 'active' : 'pending',
          approvedAt: esAdminInicial ? new Date() : null,
          // Explícito, no por DEFAULT CURRENT_TIMESTAMP. El guard compara este
          // valor contra el `authTime` del token, que nace de Date.now() en
          // Node; si uno lo pusiera el reloj de MariaDB y el otro el de Node,
          // bastaría un desfase de milisegundos entre ambos relojes para
          // invalidar sesiones legítimas. Un solo reloj, una sola verdad.
          sessionsValidFrom: new Date(),
        },
      });

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

    // El correo ya existía: se gasta un hash igualmente para no acortar la
    // respuesta, y se responde exactamente lo mismo.
    await this.passwords.hashear(datos.password);
    this.logger.warn(`Intento de registro sobre un correo ya existente.`);

    return { pendienteDeAprobacion: true };
  }

  // ── Login ──────────────────────────────────────────────────────────────────

  /**
   * Verifica credenciales y abre una sesión.
   *
   * Orden deliberado: primero la contraseña, DESPUÉS el estado de la cuenta.
   * Así, los mensajes específicos ("pendiente de aprobación", "suspendida")
   * solo los ve quien ya demostró conocer la contraseña. Al revés, cualquiera
   * podría averiguar qué correos tienen cuenta.
   */
  async entrar(
    datos: { email: string; password: string },
    contexto: ContextoDePeticion,
  ): Promise<{ tokens: ParDeTokens; perfil: PerfilPublico }> {
    const email = normalizarCorreo(datos.email);
    const usuario = await this.prisma.user.findUnique({ where: { email } });

    if (!usuario) {
      // Se gasta el mismo tiempo que una verificación real: sin esto, la
      // diferencia de milisegundos revelaría qué correos existen.
      await this.passwords.gastarTiempoEquivalente(datos.password);
      await this.audit.registrar({
        entity: 'users',
        action: 'auth.login_failed',
        changes: { motivo: 'correo_inexistente' },
        ip: contexto.ip,
        userAgent: contexto.userAgent,
      });
      throw new UnauthorizedException('Correo o contraseña incorrectos.');
    }

    if (usuario.lockedUntil && usuario.lockedUntil > new Date()) {
      await this.audit.registrar({
        userId: usuario.id,
        entity: 'users',
        entityId: usuario.id,
        action: 'auth.login_failed',
        changes: { motivo: 'bloqueo_temporal' },
        ip: contexto.ip,
        userAgent: contexto.userAgent,
      });
      throw new UnauthorizedException(
        'Demasiados intentos fallidos. Espera unos minutos e inténtalo de nuevo.',
      );
    }

    const correcta = await this.passwords.verificar(usuario.passwordHash, datos.password);

    if (!correcta) {
      await this.registrarFalloYAplicarRetraso(usuario, contexto);
      throw new UnauthorizedException('Correo o contraseña incorrectos.');
    }

    // Credenciales válidas: a partir de aquí sí se puede ser específico.
    if (usuario.status === 'pending') {
      throw new ForbiddenException(
        'Tu cuenta está pendiente de aprobación. Te avisaremos cuando esté lista.',
      );
    }
    if (usuario.status === 'suspended') {
      throw new ForbiddenException('Tu cuenta está suspendida. Contacta al administrador.');
    }

    const actualizado = await this.prisma.user.update({
      where: { id: usuario.id },
      data: { failedLoginCount: 0, lockedUntil: null, lastLoginAt: new Date() },
    });

    const tokens = await this.tokens.emitirParaNuevaSesion(actualizado, contexto);

    await this.audit.registrar({
      userId: actualizado.id,
      entity: 'users',
      entityId: actualizado.id,
      action: 'auth.login',
      ip: contexto.ip,
      userAgent: contexto.userAgent,
    });

    return { tokens, perfil: aPerfilPublico(actualizado) };
  }

  /**
   * Retraso progresivo tras fallos repetidos.
   *
   * No es un bloqueo duro a propósito: bloquear una cuenta tras N fallos
   * permitiría que alguien deje a otro fuera de su propia cuenta simplemente
   * fallando el login. El retraso crece exponencialmente y se topa, lo que
   * hace inviable la fuerza bruta sin regalar esa palanca.
   */
  private async registrarFalloYAplicarRetraso(
    usuario: User,
    contexto: ContextoDePeticion,
  ): Promise<void> {
    const fallos = usuario.failedLoginCount + 1;

    let lockedUntil: Date | null = null;
    if (fallos >= FALLOS_ANTES_DE_RETRASO) {
      const espera = Math.min(2 ** (fallos - FALLOS_ANTES_DE_RETRASO) * 1000, RETRASO_MAXIMO_MS);
      lockedUntil = new Date(Date.now() + espera);
    }

    await this.prisma.user.update({
      where: { id: usuario.id },
      data: { failedLoginCount: fallos, lockedUntil },
    });

    await this.audit.registrar({
      userId: usuario.id,
      entity: 'users',
      entityId: usuario.id,
      action: 'auth.login_failed',
      changes: { motivo: 'contrasena_incorrecta', fallos },
      ip: contexto.ip,
      userAgent: contexto.userAgent,
    });
  }

  // ── Sesión ─────────────────────────────────────────────────────────────────

  async refrescar(
    refreshToken: string,
    contexto: ContextoDePeticion,
  ): Promise<{ tokens: ParDeTokens; perfil: PerfilPublico }> {
    const { tokens, user } = await this.tokens.rotar(refreshToken, contexto);
    return { tokens, perfil: aPerfilPublico(user) };
  }

  async salir(refreshToken: string | undefined, contexto: ContextoDePeticion): Promise<void> {
    if (!refreshToken) return;

    const usuario = await this.tokens.cerrarSesion(refreshToken);

    if (usuario) {
      await this.audit.registrar({
        userId: usuario.id,
        entity: 'users',
        entityId: usuario.id,
        action: 'auth.logout',
        ip: contexto.ip,
        userAgent: contexto.userAgent,
      });
    }
  }

  /** Cierra sesión en todos los dispositivos, de inmediato. */
  async salirDeTodoslosDispositivos(
    userId: bigint,
    contexto: ContextoDePeticion,
  ): Promise<void> {
    await this.tokens.revocarTodasLasSesiones(userId);
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
   * apoderarse de la cuenta cambiando la contraseña. Al terminar, cierra todas
   * las sesiones — incluida la del atacante, si la hubiera.
   */
  async cambiarContrasena(
    userId: bigint,
    datos: { actual: string; nueva: string },
    contexto: ContextoDePeticion,
  ): Promise<void> {
    const usuario = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });

    if (!(await this.passwords.verificar(usuario.passwordHash, datos.actual))) {
      throw new UnauthorizedException('La contraseña actual no es correcta.');
    }

    await this.passwords.exigirQueSeaFuerte(datos.nueva, {
      email: usuario.email,
      displayName: usuario.displayName ?? undefined,
    });

    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash: await this.passwords.hashear(datos.nueva) },
    });

    await this.tokens.revocarTodasLasSesiones(userId);

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
}

/** Minúsculas y sin espacios: `Gerardo@X.com ` y `gerardo@x.com` son la misma cuenta. */
export function normalizarCorreo(email: string): string {
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
