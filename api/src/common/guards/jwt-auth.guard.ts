import {
  ForbiddenException,
  Injectable,
  UnauthorizedException,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';

import { SupabaseAuthService } from '../../modules/auth/supabase-auth.service';
import { PrismaService } from '../../prisma/prisma.service';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

/**
 * Barrera de autenticación de toda la API.
 *
 * Se registra como guard GLOBAL a propósito: si la protección fuera opt-in,
 * tarde o temprano un controlador nuevo se publicaría sin querer. Aquí es al
 * revés — abrir una ruta exige marcarla con @Public().
 *
 * ── Qué cambió al pasar a Supabase Auth ─────────────────────────────────────
 * La firma del token la verifica Supabase (ES256, contra su JWKS). Lo que NO
 * se delegó es la autorización: el rol y el estado siguen saliendo de NUESTRA
 * base en cada petición. Un JWT de Supabase dice quién es alguien; no sabe si
 * su cuenta fue aprobada, suspendida o degradada hace diez segundos.
 *
 * Esa lectura por petición es una consulta indexada y barata, y es lo que
 * permite tres cosas que un JWT solo no puede dar: revocación inmediata de
 * sesiones, expulsión inmediata al suspender una cuenta, y cambio de rol sin
 * esperar a que expire el token.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly supabase: SupabaseAuthService,
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

    const { authId, iatMs } = await this.supabase.verificarAccessToken(token);

    const usuario = await this.prisma.user.findUnique({
      where: { authId },
      select: {
        id: true,
        email: true,
        role: true,
        status: true,
        sessionsValidFrom: true,
      },
    });

    if (!usuario) {
      // Token válido de Supabase, pero sin perfil en la aplicación. Pasa si la
      // cuenta se creó desde el panel de Supabase saltándose el registro. Sin
      // perfil no hay rol ni estado, así que no hay nada que autorizar.
      throw new UnauthorizedException('Token inválido o expirado.');
    }

    // REVOCACIÓN INMEDIATA: cualquier token emitido antes de esta marca queda
    // muerto. Cambiar la contraseña, suspender la cuenta o "cerrar sesión en
    // todos los dispositivos" solo adelantan `sessionsValidFrom`, y el efecto
    // es instantáneo sin salir a la red ni esperar a que expire nada.
    //
    // La comparación NO redondea `sessionsValidFrom` al segundo. Hacerlo
    // parecía razonable —el `iat` de un JWT solo tiene precisión de segundos—
    // pero abre un hueco: un token emitido en el mismo segundo en que se revoca
    // la sesión sobreviviría. Esa es justamente la ventana que alguien con un
    // token robado necesita.
    //
    // El precio es un borde de menos de un segundo: si alguien vuelve a entrar
    // en el mismo segundo en que cerró todas sus sesiones, su token nuevo puede
    // caer del lado equivocado y tener que reintentar. Rechazar de más durante
    // 600 ms es preferible a aceptar de menos.
    if (iatMs < usuario.sessionsValidFrom.getTime()) {
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
