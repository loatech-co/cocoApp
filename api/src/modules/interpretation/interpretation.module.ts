import { Module } from '@nestjs/common';

import { InterpretationService } from './interpretation.service';
import { InterpretationV2Controller } from './interpretation.v2.controller';
import { CategoriesModule } from '../categories/categories.module';
import { TransactionsModule } from '../transactions/transactions.module';

@Module({
  imports: [TransactionsModule, CategoriesModule],
  controllers: [InterpretationV2Controller],
  providers: [InterpretationService],
  exports: [InterpretationService],
})
export class InterpretationModule {}
