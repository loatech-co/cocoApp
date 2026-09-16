import { Module } from '@nestjs/common';

import { SoportesController } from './soportes.controller';
import { SoportesService } from './soportes.service';

/** Los recibos de los movimientos. El binario vive fuera de la base y fuera
    del árbol web; aquí solo está quién puede verlo. */
@Module({
  controllers: [SoportesController],
  providers: [SoportesService],
  exports: [SoportesService],
})
export class SoportesModule {}
