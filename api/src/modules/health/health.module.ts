import { Module } from '@nestjs/common';

import { HealthController } from './health.controller';
import { HealthRepository } from './health.repository';
import { HealthService } from './health.service';
import { HealthV2Controller } from './health.v2.controller';

@Module({
  controllers: [HealthController, HealthV2Controller],
  providers: [HealthService, HealthRepository],
})
export class HealthModule {}
