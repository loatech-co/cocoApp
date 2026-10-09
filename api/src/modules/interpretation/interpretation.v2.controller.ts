import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';

import { CaptureInput, InterpretInput } from './dto/v2/interpretation.dto';
import type {
  Capture as CaptureBody,
  Interpretation as InterpretationBody,
} from './interpretation.domain';
import { InterpretationService } from './interpretation.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';
import { Capture, Interpretation } from '../../contract/v2/interpretation.response';
import { ApiAuthenticated, ApiErrors, ApiDataV2 } from '../../contract/v2/openapi.decorators';
import { captureV2, interpretationV2 } from '../../presenters/v2/interpretation.presenter';

/**
 * Reading a text, and the phone's capture. The capture is idempotent: the
 * same `externalRef` twice is one transaction.
 */
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
    return interpretationV2(await this.interpretation.interpret(user.id, input));
  }

  @Post('capture')
  @HttpCode(HttpStatus.OK)
  @ApiDataV2(Capture)
  @ApiErrors(400, 404, 409, 422)
  async capture(
    @CurrentUser() user: AuthenticatedUser,
    @Body() input: CaptureInput,
  ): Promise<CaptureBody> {
    return captureV2(await this.interpretation.capture(user.id, input));
  }
}
