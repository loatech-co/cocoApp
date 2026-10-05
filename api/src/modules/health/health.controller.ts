import { Controller, Get } from '@nestjs/common';

import { Public } from '../../common/decorators/public.decorator';
import { ServiceUnavailableError } from '../../common/errors/domain-error';
import { PrismaService } from '../../prisma/prisma.service';

interface HealthPayload {
  status: 'ok';
  db: 'ok';
}

/**
 * Public health check: the process answers and reaches the database.
 *
 * It used to require a token, to prove the whole chain —token, guard, user,
 * database— in one call. That made it useless to anything that checks a
 * service from outside (an uptime monitor, the deploy verification, an
 * operator with curl), which has no user to sign in as. Phase 6.8 made it
 * public; the authenticated chain is still exercised end to end by every
 * protected route, and its e2e moved to `/auth/me`.
 *
 * It reveals nothing: no user, no version, no host — only up or down.
 */
@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Public()
  @Get()
  async check(): Promise<HealthPayload> {
    const reachable = await this.prisma.isDatabaseReachable();
    if (!reachable) {
      throw new ServiceUnavailableError('La base de datos no responde.');
    }

    return { status: 'ok', db: 'ok' };
  }
}
