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
   * Sugerencia para lo que se está escribiendo en la captura rápida.
   *
   * Devuelve `{ data: null }` cuando no hay nada seguro que decir. La interfaz
   * simplemente no muestra nada — sugerir mal es peor que no sugerir.
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
    // Se arma el envelope a mano: el TransformInterceptor deja pasar `null`
    // tal cual, y la respuesta saldría con el cuerpo vacío en vez de con la
    // forma `{ data, meta }` que el cliente espera de TODA respuesta.
    const suggestion = await this.categorization.suggestForQuery(user.id, query.description);
    return { data: suggestion && suggestionV1(suggestion), meta: {} };
  }

  /**
   * La ficha avisa de que una sugerencia se aceptó o se corrigió.
   *
   * Solo entonces: un movimiento clasificado a mano sin que hubiera sugerencia
   * no pasa por aquí, y uno con descripción genérica no deja regla aunque pase.
   * Devuelve si aprendió algo, para que quien lo llama no tenga que adivinar.
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
