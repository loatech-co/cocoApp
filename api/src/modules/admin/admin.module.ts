import { Module } from '@nestjs/common';

import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { AdminV2Controller } from './admin.v2.controller';

@Module({
  controllers: [AdminController, AdminV2Controller],
  providers: [AdminService],
})
export class AdminModule {}
