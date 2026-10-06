import { Body, Controller, Get, Post, Query } from '@nestjs/common';

import { LearnBodyDto, SuggestQueryDto } from './categorization.dto';
import { CategorizationService } from './categorization.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';
import { LearnResponse, SuggestionResponse } from '../../contract/v1/categorization.response';
import { ApiAuthenticated, ApiData, ApiErrors } from '../../contract/v1/openapi.decorators';
import {
  learningV1,
  suggestionV1,
  type LearningV1,
  type SuggestionV1,
} from '../../presenters/v1/categorization.presenter';

@ApiAuthenticated()
@Controller('categorization')
export class CategorizationController {
  constructor(private readonly categorization: CategorizationService) {}

  /**
   * Suggestion for what is being typed in the quick capture.
   *
   * Returns `{ data: null }` when there is nothing certain to say. The
   * interface simply shows nothing — a wrong suggestion is worse than none.
   */
  @Get('suggest')
  @ApiData(SuggestionResponse, {
    nullable: true,
    description: '`data` is `null` when nothing is confident enough.',
  })
  @ApiErrors(400)
  async suggest(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: SuggestQueryDto,
  ): Promise<{ data: SuggestionV1 | null; meta: Record<string, never> }> {
    // The envelope is built by hand: the TransformInterceptor lets `null`
    // through as is, and the response would go out with an empty body instead
    // of the `{ data, meta }` shape the client expects from EVERY response.
    const suggestion = await this.categorization.suggestForQuery(user.id, query.description);
    return { data: suggestion && suggestionV1(suggestion), meta: {} };
  }

  /**
   * The form reports that a suggestion was accepted or corrected.
   *
   * Only then: a transaction classified by hand without a suggestion does not
   * come through here, and one with a generic description leaves no rule even
   * if it does. Returns whether it learned something, so the caller does not
   * have to guess.
   */
  @Post('learn')
  @ApiData(LearnResponse, { status: 201 })
  @ApiErrors(400, 404, 422)
  async learn(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: LearnBodyDto,
  ): Promise<LearningV1> {
    return learningV1(
      await this.categorization.learnFromForm(user.id, body.description, BigInt(body.category_id)),
    );
  }
}
