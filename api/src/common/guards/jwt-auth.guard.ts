import {
  ForbiddenException,
  Injectable,
  UnauthorizedException,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';

import { PrismaService } from '../../prisma/prisma.service';
import { TokenService } from '../../modules/auth/token.service';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

/**
 * Barrera de autenticación de toda la API.
 *
 * Se registra como guard GLOBAL a propósito: si la protección fuera opt-in,
 * tarde o temprano un controlador nuevo se publicaría sin querer. Aquí es al
 * revés — abrir una ruta exige marcarla con @Public().
 *
 * En cada petición hace una lectura del usuario por PK. Es una consulta
 * indexada y barata, y es lo que permite tres cosas que un JWT solo no puede
 * dar: revocación inmediata de sesiones, expulsión inmediata al suspender una
 * cuenta, y cambio de rol sin esperar a que expire el token.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly tokens: TokenService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const esPublica = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (esPublica) return true;

    const request = context.switchToHttp().getRequest<Request>();
    const token = extraerBearer(request.headers.authorization);

    if (!token) {
      throw new UnauthorizedException('Autenticación requerida.');
    }

    const claims = await this.tokens.verificarAccessToken(token);

    const usuario = await this.prisma.user.findUnique({
      where: { id: BigInt(claims.sub) },
      select: {
        id: true,
        email: true,
        role: true,
        status: true,
        sessionsValidFrom: true,
      },
    });

    if (!usuario) {
      throw new UnauthorizedException('Token inválido o expirado.');
    }

    // REVOCACIÓN INMEDIATA: cualquier token emitido antes de esta marca queda
    // muerto. Cambiar la contraseña, suspender la cuenta o "cerrar sesión en
    // todos los dispositivos" solo adelantan `sessionsValidFrom`, y el efecto
    // es instantáneo sin salir a la red ni esperar a que expire nada.
    if (claims.authTime < usuario.sessionsValidFrom.getTime()) {
      throw new UnauthorizedException('La sesión fue cerrada. Vuelve a entrar.');
    }

    if (usuario.status !== 'active') {
      throw new ForbiddenException(
        usuario.status === 'pending'
          ? 'Tu cuenta está pendiente de aprobación.'
          : 'Tu cuenta está suspendida.',
      );
    }

    // El rol sale de la BASE, no del token: si un admin degrada a alguien, el
    // cambio aplica en la siguiente petición y no cuando expire su token.
    request.user = { id: usuario.id, email: usuario.email, role: usuario.role };
    return true;
  }
}

export function extraerBearer(header: string | undefined): string | null {
  if (!header) return null;
  const [esquema, valor] = header.split(' ');
  return esquema === 'Bearer' && valor ? valor : null;
}
