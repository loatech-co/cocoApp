import { Module } from '@nestjs/common';

import { AdminService } from './admin.service';
import { AdminV2Controller } from './admin.v2.controller';

@Module({
  controllers: [AdminV2Controller],
  providers: [AdminService],
})
export class AdminModule {}
