import { Controller, Get } from '@nestjs/common';

import { HealthService, type LivenessPayload, type ReadinessPayload } from './health.service';
import { Public } from '../../common/decorators/public.decorator';
import { LivenessResponse, ReadinessResponse } from '../../contract/v1/health.response';
import { ApiData, ApiErrors, ApiPublic } from '../../contract/v1/openapi.decorators';

/**
 * Two public probes, for anything that checks the service from outside (an
 * uptime monitor, the deploy verification, an operator with curl), which has
 * no user to sign in as:
 *
 *   · `GET /health` — the process is alive. Never touches the database.
 *   · `GET /ready`  — the process can serve: the database answers `SELECT 1`.
 *
 * Kept apart so a database outage reads as "not ready" and not as "the API is
 * down": restarting the process does not fix an unreachable database.
 *
 * Neither reveals anything: no user, no version, no host — only up or down.
 * The authenticated chain is exercised end to end by every protected route.
 */
@ApiPublic()
@Controller()
export class HealthController {
  constructor(private readonly health: HealthService) {}

  @Public()
  @Get('health')
  @ApiData(LivenessResponse)
  live(): LivenessPayload {
    return this.health.live();
  }

  @Public()
  @Get('ready')
  @ApiData(ReadinessResponse)
  @ApiErrors(503)
  ready(): Promise<ReadinessPayload> {
    return this.health.ready();
  }
}
