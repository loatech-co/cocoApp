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

/** M2 — Etiquetas transversales. */
@Controller('tags')
export class TagsController {
  constructor(private readonly tags: TagsService) {}

  @Get()
  listar(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<{ data: TagView[]; meta: { total: number } }> {
    return this.tags.listar(user.id);
  }

  @Post()
  crear(@CurrentUser() user: AuthenticatedUser, @Body() dto: UpsertTagDto): Promise<TagView> {
    return this.tags.obtenerOCrear(user.id, dto.name, dto.color);
  }

  @Patch(':id')
  actualizar(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseBigIntPipe) id: bigint,
    @Body() dto: UpsertTagDto,
  ): Promise<TagView> {
    return this.tags.actualizar(user.id, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  eliminar(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseBigIntPipe) id: bigint,
  ): Promise<void> {
    return this.tags.eliminar(user.id, id);
  }
}
