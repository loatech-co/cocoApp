import { Module } from '@nestjs/common';

import { InterpretacionController } from './interpretacion.controller';
import { InterpretacionRepository } from './interpretacion.repository';
import { InterpretacionService } from './interpretacion.service';
import { TransactionsModule } from '../transactions/transactions.module';

@Module({
  imports: [TransactionsModule],
  controllers: [InterpretacionController],
  providers: [InterpretacionService, InterpretacionRepository],
  exports: [InterpretacionService],
})
export class InterpretacionModule {}
