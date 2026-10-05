import { Controller, Get } from '@nestjs/common';

import { HealthService, type HealthPayload } from './health.service';
import { Public } from '../../common/decorators/public.decorator';

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
  constructor(private readonly health: HealthService) {}

  @Public()
  @Get()
  check(): Promise<HealthPayload> {
    return this.health.check();
  }
}
