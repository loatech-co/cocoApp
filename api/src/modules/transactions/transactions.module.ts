import { Module } from '@nestjs/common';

import { LedgerRepository } from './ledger.repository';
import { LedgerService } from './ledger.service';
import { TransactionsController } from './transactions.controller';
import { TransactionsRepository } from './transactions.repository';
import { TransactionsService } from './transactions.service';
import { SoportesModule } from '../soportes/soportes.module';
import { TagsModule } from '../tags/tags.module';

@Module({
  imports: [TagsModule, SoportesModule],
  controllers: [TransactionsController],
  providers: [TransactionsService, TransactionsRepository, LedgerService, LedgerRepository],
  exports: [TransactionsService, LedgerService],
})
export class TransactionsModule {}
