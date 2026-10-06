import { Module } from '@nestjs/common';

import { AutoChargeTask } from './auto-charge.task';
import { AutomaticPaymentsService } from './automatic-payments';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';
import { DashboardV2Controller } from './dashboard.v2.controller';
import { AccountsModule } from '../accounts/accounts.module';
import { CategoriesModule } from '../categories/categories.module';
import { TransactionsModule } from '../transactions/transactions.module';

@Module({
  imports: [AccountsModule, CategoriesModule, TransactionsModule],
  controllers: [DashboardController, DashboardV2Controller],
  providers: [DashboardService, AutomaticPaymentsService, AutoChargeTask],
})
export class DashboardModule {}
