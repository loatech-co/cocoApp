import { Controller, Get } from '@nestjs/common';

import { HealthService, type LivenessPayload, type ReadinessPayload } from './health.service';
import { Public } from '../../common/decorators/public.decorator';
import { Liveness, Readiness } from '../../contract/v2/misc.response';
import { ApiErrors, ApiPublic, ApiDataV2 } from '../../contract/v2/openapi.decorators';

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
 * Neither reveals anything about a user or the host: up or down, and which
 * commit is running.
 */
@ApiPublic()
@Controller({ version: '2' })
export class HealthV2Controller {
  constructor(private readonly health: HealthService) {}

  @Public()
  @Get('health')
  @ApiDataV2(Liveness)
  live(): LivenessPayload {
    return this.health.live();
  }

  @Public()
  @Get('ready')
  @ApiDataV2(Readiness)
  @ApiErrors(503)
  ready(): Promise<ReadinessPayload> {
    return this.health.ready();
  }
}
