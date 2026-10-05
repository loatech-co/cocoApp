import { Module } from '@nestjs/common';

import { InterpretacionController } from './interpretacion.controller';
import { InterpretacionService } from './interpretacion.service';
import { InterpretacionV2Controller } from './interpretacion.v2.controller';
import { CategoriesModule } from '../categories/categories.module';
import { TransactionsModule } from '../transactions/transactions.module';

@Module({
  imports: [TransactionsModule, CategoriesModule],
  controllers: [InterpretacionController, InterpretacionV2Controller],
  providers: [InterpretacionService],
  exports: [InterpretacionService],
})
export class InterpretacionModule {}
