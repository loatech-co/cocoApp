import { Module } from '@nestjs/common';

import { RecurrencePausesRepository } from './recurrence-pauses.repository';
import { RecurrencePausesV2Controller } from './recurrence-pauses.v2.controller';
import { RecurrenceService } from './recurrence.service';
import { CategoriesModule } from '../categories/categories.module';
import { TransactionsModule } from '../transactions/transactions.module';

/**
 * The pauses of a recurring concept (ADR 0036). Its own module because it
 * needs the categories and the ledger, and the dashboard needs it: inside
 * `categories` it would close a cycle.
 */
@Module({
  imports: [CategoriesModule, TransactionsModule],
  controllers: [RecurrencePausesV2Controller],
  providers: [RecurrenceService, RecurrencePausesRepository],
  exports: [RecurrenceService],
})
export class RecurrenceModule {}
