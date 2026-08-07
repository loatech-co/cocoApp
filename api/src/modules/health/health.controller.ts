import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';
import { PrismaService } from '../../prisma/prisma.service';

interface HealthPayload {
  status: 'ok';
  db: 'ok';
  user_id: number;
}

/**
 * Healthcheck AUTENTICADO.
 *
 * No lleva @Public() a propósito: su trabajo no es solo decir "el proceso está
 * vivo", sino probar la cadena completa —el cliente presenta un access token,
 * el guard lo verifica, resuelve el user_id contra `users` y la API alcanza
 * MariaDB—. Es el criterio de aceptación de la Fase 0.
 */
@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async check(@CurrentUser() user: AuthenticatedUser): Promise<HealthPayload> {
    const reachable = await this.prisma.isDatabaseReachable();
    if (!reachable) {
      throw new ServiceUnavailableException('La base de datos no responde.');
    }

    return { status: 'ok', db: 'ok', user_id: Number(user.id) };
  }
}
