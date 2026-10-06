import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import { CaptureInput, InterpretInput } from './dto/v2/interpretation.dto';
import type {
  Capture as CaptureBody,
  Interpretation as InterpretationBody,
} from './interpretation.domain';
import type { CaptureBodyDto, InterpretBodyDto } from './interpretation.dto';
import { InterpretationService } from './interpretation.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';
import { Capture, Interpretation } from '../../contract/v2/interpretation.response';
import { ApiAuthenticated, ApiErrors, ApiDataV2 } from '../../contract/v2/openapi.decorators';
import { defined, type V1Draft } from '../../contract/v2/v1-input';
import { captureV2, interpretationV2 } from '../../presenters/v2/interpretation.presenter';

/** The fields both routes read, in their v1 names. */
function textFields(input: InterpretInput): V1Draft<InterpretBodyDto> {
  return {
    texto: input.text,
    comercio: input.merchant,
    monto: input.amount,
    fecha: input.date,
    nombre_de_archivo: input.fileName,
    periodo: input.period,
  };
}

function interpretBody(input: InterpretInput): InterpretBodyDto {
  return defined(textFields(input));
}

function captureBody(input: CaptureInput): CaptureBodyDto {
  return {
    ...defined<V1Draft<CaptureBodyDto>>({
      ...textFields(input),
      captured_at: input.capturedAt,
      category_id: input.categoryId,
      nota: input.note,
    }),
    source: input.source,
    external_ref: input.externalRef,
  };
}

/**
 * v2 of reading a text and of the phone's capture: the same service, its own
 * presenter. The capture keeps its idempotency: the same
 * `externalRef` twice is one transaction.
 */
// The tag the contract was published with: the swagger plugin derives it from
// the class name, and the web's generated client is split by tag. It goes with
// the published ids (src/openapi/document.ts).
@ApiTags('InterpretacionV2')
@ApiAuthenticated()
@Controller({ path: 'transactions', version: '2' })
export class InterpretationV2Controller {
  constructor(private readonly interpretation: InterpretationService) {}

  @Post('interpret')
  @HttpCode(HttpStatus.OK)
  @ApiDataV2(Interpretation)
  @ApiErrors(400, 422)
  async interpret(
    @CurrentUser() user: AuthenticatedUser,
    @Body() input: InterpretInput,
  ): Promise<InterpretationBody> {
    return interpretationV2(await this.interpretation.interpret(user.id, interpretBody(input)));
  }

  @Post('capture')
  @HttpCode(HttpStatus.OK)
  @ApiDataV2(Capture)
  @ApiErrors(400, 404, 409, 422)
  async capture(
    @CurrentUser() user: AuthenticatedUser,
    @Body() input: CaptureInput,
  ): Promise<CaptureBody> {
    return captureV2(await this.interpretation.capture(user.id, captureBody(input)));
  }
}
