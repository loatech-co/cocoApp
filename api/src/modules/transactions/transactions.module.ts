import { Module } from '@nestjs/common';

import { CaptureRepository } from './capture.repository';
import { LedgerRepository } from './ledger.repository';
import { LedgerService } from './ledger.service';
import { TransactionsController } from './transactions.controller';
import { TransactionsRepository } from './transactions.repository';
import { TransactionsService } from './transactions.service';
import { TransactionsV2Controller } from './transactions.v2.controller';
import { SoportesModule } from '../soportes/soportes.module';
import { TagsModule } from '../tags/tags.module';

@Module({
  imports: [TagsModule, SoportesModule],
  controllers: [TransactionsController, TransactionsV2Controller],
  providers: [
    TransactionsService,
    TransactionsRepository,
    LedgerService,
    LedgerRepository,
    CaptureRepository,
  ],
  exports: [TransactionsService, LedgerService],
})
export class TransactionsModule {}
