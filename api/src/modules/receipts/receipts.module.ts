import { Module } from '@nestjs/common';

import { createReceiptStore, RECEIPT_STORE } from './receipt-store';
import { ReceiptsController } from './receipts.controller';
import { ReceiptsRepository } from './receipts.repository';
import { ReceiptsService } from './receipts.service';
import { ReceiptsV2Controller } from './receipts.v2.controller';

/** Los recibos de los movimientos. El binario vive fuera de la base y fuera
    del árbol web; aquí solo está quién puede verlo. */
@Module({
  controllers: [ReceiptsController, ReceiptsV2Controller],
  providers: [
    ReceiptsService,
    ReceiptsRepository,
    { provide: RECEIPT_STORE, useFactory: () => createReceiptStore() },
  ],
  exports: [ReceiptsService],
})
export class ReceiptsModule {}
