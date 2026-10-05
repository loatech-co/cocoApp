import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';

import { CaptureBodyDto, InterpretBodyDto } from './interpretacion.dto';
import { InterpretacionService } from './interpretacion.service';
import type { CapturaView, InterpretacionView } from './interpretation.view';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';

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
