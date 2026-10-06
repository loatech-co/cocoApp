import { Global, Module } from '@nestjs/common';

import { CategorizationRepository } from './categorization.repository';
import { CategorizationService } from './categorization.service';
import { CategorizationV2Controller } from './categorization.v2.controller';
import { CategoriesModule } from '../categories/categories.module';
import { TransactionsModule } from '../transactions/transactions.module';

/**
 * Global because the import module needs the service, and so will the fixed
 * concepts module in the future.
 */
@Global()
@Module({
  imports: [TransactionsModule, CategoriesModule],
  controllers: [CategorizationV2Controller],
  providers: [CategorizationService, CategorizationRepository],
  exports: [CategorizationService],
})
export class CategorizationModule {}
