import { Module } from '@nestjs/common';

import { createReceiptStore, RECEIPT_STORE } from './receipt-store';
import { SoportesController } from './soportes.controller';
import { SoportesRepository } from './soportes.repository';
import { SoportesService } from './soportes.service';

/** Los recibos de los movimientos. El binario vive fuera de la base y fuera
    del árbol web; aquí solo está quién puede verlo. */
@Module({
  controllers: [SoportesController],
  providers: [
    SoportesService,
    SoportesRepository,
    { provide: RECEIPT_STORE, useFactory: () => createReceiptStore() },
  ],
  exports: [SoportesService],
})
export class SoportesModule {}
