import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { User } from '@prisma/client';
import { createHash, randomBytes, randomUUID } from 'node:crypto';

import { PrismaService } from '../../prisma/prisma.service';

/**
 * Claims del access token.
 *
 * `authTime` es la clave de la revocación inmediata: se compara contra el
 * `sessionsValidFrom` del usuario, y cualquier token emitido antes se rechaza.
 */
export interface AccessTokenPayload {
  /** user_id como string: JWT no admite BigInt. */
  sub: string;
  email: string;
  role: User['role'];
  /** Momento en que nació la sesión, en milisegundos. */
  authTime: number;
}

export interface ParDeTokens {
  accessToken: string;
  /** Solo se devuelve una vez; después solo vive hasheado. */
  refreshToken: string;
  expiresIn: number;
}

/** Corto a propósito: limita la ventana útil de un token robado. */
const ACCESS_TTL_SEGUNDOS = 15 * 60;
const REFRESH_TTL_DIAS = 30;

@Injectable()
export class TokenService {
  private readonly logger = new Logger(TokenService.name);
  private readonly secreto: string;

  constructor(
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
    config: ConfigService,
  ) {
    this.secreto = config.getOrThrow<string>('JWT_SECRET');
  }

  // ── Emisión ────────────────────────────────────────────────────────────────

  /**
   * Emite un par de tokens para una sesión NUEVA (login).
   * Cada login abre su propia familia de refresh tokens, así revocar una sesión
   * no tumba las demás.
   */
  async emitirParaNuevaSesion(
    user: User,
    contexto: { ip?: string; userAgent?: string },
  ): Promise<ParDeTokens> {
    return this.emitir(user, randomUUID(), contexto);
  }

  private async emitir(
    user: User,
    familyId: string,
    contexto: { ip?: string; userAgent?: string },
  ): Promise<ParDeTokens> {
    const authTime = Date.now();

    const accessToken = await this.jwt.signAsync(
      {
        sub: user.id.toString(),
        email: user.email,
        role: user.role,
        authTime,
      } satisfies AccessTokenPayload,
      { secret: this.secreto, expiresIn: ACCESS_TTL_SEGUNDOS },
    );

    // 256 bits de aleatoriedad criptográfica: no hay diccionario que atacar,
    // por eso basta con SHA-256 para guardarlo (argon2 sería malgastar CPU).
    const refreshToken = randomBytes(32).toString('base64url');

    await this.prisma.refreshToken.create({
      data: {
        userId: user.id,
        tokenHash: hashDeToken(refreshToken),
        familyId,
        expiresAt: new Date(Date.now() + REFRESH_TTL_DIAS * 24 * 60 * 60 * 1000),
        ip: contexto.ip ?? null,
        userAgent: contexto.userAgent?.slice(0, 255) ?? null,
      },
    });

    return { accessToken, refreshToken, expiresIn: ACCESS_TTL_SEGUNDOS };
  }

  // ── Rotación ───────────────────────────────────────────────────────────────

  /**
   * Canjea un refresh token por un par nuevo.
   *
   * DETECCIÓN DE REUSO: si el token presentado ya fue consumido, significa que
   * existe una copia en manos ajenas —el legítimo ya rotó— y se revoca la
   * familia entera. Es la recomendación de la OAuth 2.0 Security BCP para
   * clientes públicos, y convierte un robo silencioso en un cierre de sesión
   * visible para el dueño.
   */
  async rotar(
    refreshToken: string,
    contexto: { ip?: string; userAgent?: string },
  ): Promise<{ tokens: ParDeTokens; user: User }> {
    const almacenado = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: hashDeToken(refreshToken) },
      include: { user: true },
    });

    if (!almacenado) {
      throw new UnauthorizedException('Sesión inválida.');
    }

    if (almacenado.usedAt) {
      this.logger.warn(
        `Reuso de refresh token detectado (familia ${almacenado.familyId}, usuario ${almacenado.userId}). Se revoca la familia.`,
      );
      await this.revocarFamilia(almacenado.familyId);
      throw new UnauthorizedException('Sesión inválida.');
    }

    if (almacenado.revokedAt || almacenado.expiresAt < new Date()) {
      throw new UnauthorizedException('Sesión expirada.');
    }

    if (almacenado.user.status !== 'active') {
      throw new UnauthorizedException('La cuenta no está activa.');
    }

    // Marcar como usado ANTES de emitir el nuevo: si algo falla después, el
    // token viejo ya no sirve y no queda una ventana con dos válidos.
    await this.prisma.refreshToken.update({
      where: { id: almacenado.id },
      data: { usedAt: new Date() },
    });

    const tokens = await this.emitir(almacenado.user, almacenado.familyId, contexto);
    return { tokens, user: almacenado.user };
  }

  // ── Revocación ─────────────────────────────────────────────────────────────

  /**
   * Cierra la sesión a la que pertenece este refresh token (logout normal) y
   * devuelve su dueño, o `null` si el token no existe.
   *
   * Revoca la FAMILIA entera, no solo el eslabón presentado: una sesión es la
   * cadena completa de rotaciones, así que dejar viva cualquier otra pieza
   * dejaría la sesión medio abierta.
   *
   * No rota nada. Rotar aquí marcaría el token como usado y emitiría un par
   * nuevo que nadie va a recibir — basura en la tabla y, peor, un `usedAt`
   * puesto por el propio logout que confundiría a la detección de reuso.
   */
  async cerrarSesion(refreshToken: string): Promise<User | null> {
    const almacenado = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: hashDeToken(refreshToken) },
      include: { user: true },
    });

    if (!almacenado) return null;

    await this.revocarFamilia(almacenado.familyId);
    return almacenado.user;
  }

  async revocarFamilia(familyId: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { familyId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  /**
   * Cierra TODAS las sesiones de un usuario, de inmediato.
   *
   * Adelantar `sessionsValidFrom` invalida los access tokens ya emitidos sin
   * esperar a que expiren: el guard compara contra esta marca en cada petición.
   * Revocar los refresh tokens impide además obtener uno nuevo.
   */
  async revocarTodasLasSesiones(userId: bigint): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: userId },
        data: { sessionsValidFrom: new Date() },
      }),
      this.prisma.refreshToken.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);
  }

  // ── Verificación ───────────────────────────────────────────────────────────

  async verificarAccessToken(token: string): Promise<AccessTokenPayload> {
    try {
      return await this.jwt.verifyAsync<AccessTokenPayload>(token, { secret: this.secreto });
    } catch {
      throw new UnauthorizedException('Token inválido o expirado.');
    }
  }

  /** Purga tokens vencidos. Pensado para un cron ligero. */
  async purgarVencidos(): Promise<number> {
    const { count } = await this.prisma.refreshToken.deleteMany({
      where: { expiresAt: { lt: new Date() } },
    });
    return count;
  }
}

/** SHA-256 en hex. 64 caracteres, que es justo el ancho de la columna. */
export function hashDeToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
