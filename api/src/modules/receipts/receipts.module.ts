import { Module } from '@nestjs/common';

import { createReceiptStore, RECEIPT_STORE } from './receipt-store';
import { ReceiptsRepository } from './receipts.repository';
import { ReceiptsService } from './receipts.service';
import { ReceiptsV2Controller } from './receipts.v2.controller';

/** The receipts of transactions. The binary lives outside the database and
    outside the web tree; this only holds who may see it. */
@Module({
  controllers: [ReceiptsV2Controller],
  providers: [
    ReceiptsService,
    ReceiptsRepository,
    { provide: RECEIPT_STORE, useFactory: () => createReceiptStore() },
  ],
  exports: [ReceiptsService],
})
export class ReceiptsModule {}
