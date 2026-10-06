import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import { CaptureBodyDto, InterpretBodyDto } from './interpretation.dto';
import { InterpretationService } from './interpretation.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';
import { CaptureResponse, InterpretationResponse } from '../../contract/v1/interpretation.response';
import { ApiAuthenticated, ApiData, ApiErrors } from '../../contract/v1/openapi.decorators';
import {
  captureV1,
  interpretationV1,
  type CaptureV1,
  type InterpretationV1,
} from '../../presenters/v1/interpretation.presenter';

// The tag the contract was published with: the swagger plugin derives it from
// the class name, and the web's generated client is split by tag. It goes with
// the published ids (src/openapi/document.ts).
@ApiTags('Interpretacion')
@ApiAuthenticated()
@Controller('transactions')
export class InterpretationController {
  constructor(private readonly interpretation: InterpretationService) {}

  /** Sin efectos: interpreta y devuelve, para rellenar una ficha. */
  @Post('interpret')
  @HttpCode(HttpStatus.OK)
  @ApiData(InterpretationResponse)
  @ApiErrors(400, 422)
  async interpret(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: InterpretBodyDto,
  ): Promise<InterpretationV1> {
    return interpretationV1(await this.interpretation.interpret(user.id, dto));
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
  @ApiData(CaptureResponse)
  @ApiErrors(400, 404, 409, 422)
  async capture(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CaptureBodyDto,
  ): Promise<CaptureV1> {
    return captureV1(await this.interpretation.capture(user.id, dto));
  }
}
