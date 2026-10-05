import { Body, Controller, Get, Post, Query } from '@nestjs/common';

import { CategorizationService, type SugerenciaView } from './categorization.service';
import { LearnInput, SuggestQuery } from './dto/v2/categorization.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';
import { ApiAuthenticated, ApiErrors } from '../../contract/v1/openapi.decorators';
import { Learning, Suggestion } from '../../contract/v2/categorization.response';
import { ApiDataV2 } from '../../contract/v2/openapi.decorators';
import { toV2, type ToV2 } from '../../contract/v2/to-v2';

/** v2 of the automatic classification: the same service, translated at the edge. */
@ApiAuthenticated()
@Controller({ path: 'categorization', version: '2' })
export class CategorizationV2Controller {
  constructor(private readonly categorization: CategorizationService) {}

  @Get('suggest')
  @ApiDataV2(Suggestion, {
    nullable: true,
    description: '`data` is `null` when nothing is confident enough.',
  })
  @ApiErrors(400)
  async suggest(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: SuggestQuery,
  ): Promise<{ data: ToV2<SugerenciaView> | null; meta: Record<string, never> }> {
    const suggestion = await this.categorization.suggestForQuery(user.id, query.description);
    return { data: toV2(suggestion), meta: {} };
  }

  @Post('learn')
  @ApiDataV2(Learning, { status: 201 })
  @ApiErrors(400, 404, 422)
  async learn(
    @CurrentUser() user: AuthenticatedUser,
    @Body() input: LearnInput,
  ): Promise<ToV2<{ aprendido: boolean }>> {
    return toV2(
      await this.categorization.aprenderDesdeLaFicha(
        user.id,
        input.description,
        BigInt(input.categoryId),
      ),
    );
  }
}
