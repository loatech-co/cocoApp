import { Controller, Get } from '@nestjs/common';

import { HealthService, type LivenessPayload, type ReadinessPayload } from './health.service';
import { Public } from '../../common/decorators/public.decorator';
import { ApiErrors, ApiPublic } from '../../contract/v1/openapi.decorators';
import { Liveness, Readiness } from '../../contract/v2/misc.response';
import { ApiDataV2 } from '../../contract/v2/openapi.decorators';

/**
 * The two public probes under v2. Same answers as v1 (they were English
 * already); what changes is that a probe pointed here does not count as a v1
 * use, so the seven days without v1 traffic (7.10) can actually happen.
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
