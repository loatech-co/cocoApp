import { Module } from '@nestjs/common';

import { AutoChargeTask } from './auto-charge.task';
import { DashboardController } from './dashboard.controller';
import { DashboardRepository } from './dashboard.repository';
import { DashboardService } from './dashboard.service';
import { PagosAutomaticosService } from './pagos-automaticos';
import { AccountsModule } from '../accounts/accounts.module';

@Module({
  imports: [AccountsModule],
  controllers: [DashboardController],
  providers: [DashboardService, DashboardRepository, PagosAutomaticosService, AutoChargeTask],
})
export class DashboardModule {}
