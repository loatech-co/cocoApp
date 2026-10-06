import { Body, Controller, Get, Post, Query } from '@nestjs/common';

import {
  CategorizationService,
  type Learning as LearningBody,
  type Suggestion as SuggestionBody,
} from './categorization.service';
import { LearnInput, SuggestQuery } from './dto/v2/categorization.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';
import { Learning, Suggestion } from '../../contract/v2/categorization.response';
import { ApiAuthenticated, ApiErrors, ApiDataV2 } from '../../contract/v2/openapi.decorators';
import { learningV2, suggestionV2 } from '../../presenters/v2/categorization.presenter';

/** v2 of the automatic classification: the same service, its own presenter. */
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
  ): Promise<{ data: SuggestionBody | null; meta: Record<string, never> }> {
    const suggestion = await this.categorization.suggestForQuery(user.id, query.description);
    return { data: suggestion && suggestionV2(suggestion), meta: {} };
  }

  @Post('learn')
  @ApiDataV2(Learning, { status: 201 })
  @ApiErrors(400, 404, 422)
  async learn(
    @CurrentUser() user: AuthenticatedUser,
    @Body() input: LearnInput,
  ): Promise<LearningBody> {
    return learningV2(
      await this.categorization.learnFromForm(user.id, input.description, BigInt(input.categoryId)),
    );
  }
}
