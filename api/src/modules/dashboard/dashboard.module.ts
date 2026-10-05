import { Module } from '@nestjs/common';

import { AutoChargeTask } from './auto-charge.task';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';
import { DashboardV2Controller } from './dashboard.v2.controller';
import { PagosAutomaticosService } from './pagos-automaticos';
import { AccountsModule } from '../accounts/accounts.module';
import { CategoriesModule } from '../categories/categories.module';
import { TransactionsModule } from '../transactions/transactions.module';

@Module({
  imports: [AccountsModule, CategoriesModule, TransactionsModule],
  controllers: [DashboardController, DashboardV2Controller],
  providers: [DashboardService, PagosAutomaticosService, AutoChargeTask],
})
export class DashboardModule {}
