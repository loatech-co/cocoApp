import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';

import {
  DiscardPausedChargesInput,
  PauseRenewalInput,
  ResumeRenewalInput,
} from './dto/v2/recurrence-pauses.dto';
import {
  RecurrenceService,
  type DiscardedCharges as DiscardedBody,
  type PausedCharge as ChargeBody,
  type RecurrencePause as PauseBody,
} from './recurrence.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ParseBigIntPipe } from '../../common/pipes/parse-bigint.pipe';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';
import {
  ApiAuthenticated,
  ApiDataV2,
  ApiErrors,
  ApiNoContent,
} from '../../contract/v2/openapi.decorators';
import { PageQuery } from '../../contract/v2/page.dto';
import { paginate, type Page } from '../../contract/v2/pagination';
import {
  DiscardedCharges,
  PausedCharge,
  RecurrencePause,
} from '../../contract/v2/recurrence.response';
import {
  discardedChargesV2,
  pausedChargeV2,
  recurrencePauseV2,
} from '../../presenters/v2/recurrence.presenter';

/**
 * v2 of the pauses of a recurring concept (ADR 0036), under the concept they
 * belong to: `/categories/:id/pauses`.
 */
@ApiAuthenticated()
@Controller({ path: 'categories/:id/pauses', version: '2' })
export class RecurrencePausesV2Controller {
  constructor(private readonly recurrence: RecurrenceService) {}

  /** The concept's pause history, the most recent first. */
  @Get()
  @ApiDataV2(RecurrencePause, { isPage: true })
  @ApiErrors(400, 404)
  async list(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseBigIntPipe) id: bigint,
    @Query() query: PageQuery,
  ): Promise<Page<PauseBody>> {
    const pauses = await this.recurrence.list(user.id, id);
    return paginate(pauses.map(recurrencePauseV2), query);
  }

  /** Pauses the renewal from `fromMonth` on, with no end yet. */
  @Post()
  @ApiDataV2(RecurrencePause, { status: 201 })
  @ApiErrors(400, 404, 409, 422)
  async pause(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseBigIntPipe) id: bigint,
    @Body() input: PauseRenewalInput,
  ): Promise<PauseBody> {
    return recurrencePauseV2(await this.recurrence.pause(user.id, id, input.fromMonth));
  }

  /** Sets the month the concept renews again. */
  @Patch(':pauseId')
  @ApiDataV2(RecurrencePause)
  @ApiErrors(400, 404, 409, 422)
  async resume(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseBigIntPipe) id: bigint,
    @Param('pauseId', ParseBigIntPipe) pauseId: bigint,
    @Body() input: ResumeRenewalInput,
  ): Promise<PauseBody> {
    return recurrencePauseV2(await this.recurrence.resume(user.id, id, pauseId, input.resumeMonth));
  }

  /** Removes a period, as if it had never been scheduled. */
  @Delete(':pauseId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContent()
  @ApiErrors(400, 404)
  remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseBigIntPipe) id: bigint,
    @Param('pauseId', ParseBigIntPipe) pauseId: bigint,
  ): Promise<void> {
    return this.recurrence.remove(user.id, id, pauseId);
  }

  /** The automatic charges already written in months this pause covers. */
  @Get(':pauseId/charges')
  @ApiDataV2(PausedCharge, { isPage: true })
  @ApiErrors(400, 404)
  async charges(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseBigIntPipe) id: bigint,
    @Param('pauseId', ParseBigIntPipe) pauseId: bigint,
    @Query() query: PageQuery,
  ): Promise<Page<ChargeBody>> {
    const charges = await this.recurrence.chargesInPause(user.id, id, pauseId);
    return paginate(charges.map(pausedChargeV2), query);
  }

  /** Deletes the automatic charges the person confirmed, all from `charges`. */
  @Post(':pauseId/charges/discard')
  @HttpCode(HttpStatus.OK)
  @ApiDataV2(DiscardedCharges)
  @ApiErrors(400, 404, 422)
  async discard(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseBigIntPipe) id: bigint,
    @Param('pauseId', ParseBigIntPipe) pauseId: bigint,
    @Body() input: DiscardPausedChargesInput,
  ): Promise<DiscardedBody> {
    const ids = input.transactionIds.map((transactionId) => BigInt(transactionId));
    return discardedChargesV2(await this.recurrence.discardCharges(user.id, id, pauseId, ids));
  }
}
