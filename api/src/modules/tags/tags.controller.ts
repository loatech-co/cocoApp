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
} from '@nestjs/common';

import { UpsertTagDto } from './tags.dto';
import { TagsService, type TagView } from './tags.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ParseBigIntPipe } from '../../common/pipes/parse-bigint.pipe';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';
import {
  ApiAuthenticated,
  ApiData,
  ApiErrors,
  ApiNoContent,
} from '../../contract/v1/openapi.decorators';
import { TagResponse } from '../../contract/v1/tags.response';

/** M2 — Etiquetas transversales. */
@ApiAuthenticated()
@Controller('tags')
export class TagsController {
  constructor(private readonly tags: TagsService) {}

  @Get()
  @ApiData(TagResponse, { isArray: true, meta: 'total' })
  listar(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<{ data: TagView[]; meta: { total: number } }> {
    return this.tags.listar(user.id);
  }

  @Post()
  @ApiData(TagResponse, { status: 201 })
  @ApiErrors(400, 409)
  crear(@CurrentUser() user: AuthenticatedUser, @Body() dto: UpsertTagDto): Promise<TagView> {
    return this.tags.obtenerOCrear(user.id, dto.name, dto.color);
  }

  @Patch(':id')
  @ApiData(TagResponse)
  @ApiErrors(400, 404, 409)
  actualizar(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseBigIntPipe) id: bigint,
    @Body() dto: UpsertTagDto,
  ): Promise<TagView> {
    return this.tags.actualizar(user.id, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContent()
  @ApiErrors(400, 404)
  eliminar(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseBigIntPipe) id: bigint,
  ): Promise<void> {
    return this.tags.eliminar(user.id, id);
  }
}
