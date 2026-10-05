import { Body, Controller, HttpCode, HttpStatus, Module, Post } from '@nestjs/common';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';
import { TransactionsModule } from '../transactions/transactions.module';
import { CaptureBodyDto, InterpretBodyDto } from './interpretacion.dto';
import {
  InterpretacionService,
  type CapturaView,
  type InterpretacionView,
} from './interpretacion.service';

/**
 * Las dos puertas del cerebro, bajo `/transactions` como el resto de lo que
 * toca movimientos. Un controlador aparte y no dos métodos más en el de
 * movimientos, porque dependen de otro servicio y de otro módulo: mezclarlos
 * haría que el de movimientos cargara con la categorización.
 */
@Controller('transactions')
export class InterpretacionController {
  constructor(private readonly interpretacion: InterpretacionService) {}

  /** Sin efectos: interpreta y devuelve, para rellenar una ficha. */
  @Post('interpret')
  @HttpCode(HttpStatus.OK)
  interpretar(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: InterpretBodyDto,
  ): Promise<InterpretacionView> {
    return this.interpretacion.interpretar(user.id, dto);
  }

  /**
   * Interpreta, clasifica, busca duplicados y crea, de una.
   *
   * Siempre 200, también cuando crea: la respuesta es «esto es lo que hay con
   * tu referencia», sea nuevo, repetido o fusionado, y el cliente lo distingue
   * por los dos indicadores del cuerpo. Un 201 solo a veces obligaría a quien
   * reintenta a tratar dos códigos como el mismo resultado.
   */
  @Post('capture')
  @HttpCode(HttpStatus.OK)
  capturar(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CaptureBodyDto,
  ): Promise<CapturaView> {
    return this.interpretacion.capturar(user.id, dto);
  }
}

@Module({
  imports: [TransactionsModule],
  controllers: [InterpretacionController],
  providers: [InterpretacionService],
  exports: [InterpretacionService],
})
export class InterpretacionModule {}
