import { Body, Controller, Get, Post, Query } from '@nestjs/common';

import { LearnBodyDto, SuggestQueryDto } from './categorization.dto';
import { CategorizationService, type SugerenciaView } from './categorization.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';

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
  async sugerir(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: SuggestQueryDto,
  ): Promise<{ data: SugerenciaView | null; meta: Record<string, never> }> {
    // Se arma el envelope a mano: el TransformInterceptor deja pasar `null`
    // tal cual, y la respuesta saldría con el cuerpo vacío en vez de con la
    // forma `{ data, meta }` que el cliente espera de TODA respuesta.
    return {
      data: await this.categorization.suggestForQuery(user.id, query.description),
      meta: {},
    };
  }

  /**
   * La ficha avisa de que una sugerencia se aceptó o se corrigió.
   *
   * Solo entonces: un movimiento clasificado a mano sin que hubiera sugerencia
   * no pasa por aquí, y uno con descripción genérica no deja regla aunque pase.
   * Devuelve si aprendió algo, para que quien lo llama no tenga que adivinar.
   */
  @Post('learn')
  async aprender(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: LearnBodyDto,
  ): Promise<{ aprendido: boolean }> {
    return this.categorization.aprenderDesdeLaFicha(
      user.id,
      body.description,
      BigInt(body.category_id),
    );
  }
}
