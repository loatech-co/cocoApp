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

import { UpsertTagDto } from './tags.dto';
import { TagsService, type Tag as TagBody } from './tags.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ParseBigIntPipe } from '../../common/pipes/parse-bigint.pipe';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';
import { Tag } from '../../contract/v2/misc.response';
import {
  ApiAuthenticated,
  ApiErrors,
  ApiNoContent,
  ApiDataV2,
} from '../../contract/v2/openapi.decorators';
import { PageQuery } from '../../contract/v2/page.dto';
import { paginate, type Page } from '../../contract/v2/pagination';

/**
 * v2 of the tags. The input (`name`, `color`) was already English, so it is
 * the v1 DTO; the output was too, and only the list changes, into a page.
 */
@ApiAuthenticated()
@Controller({ path: 'tags', version: '2' })
export class TagsV2Controller {
  constructor(private readonly tags: TagsService) {}

  @Get()
  @ApiDataV2(Tag, { isPage: true })
  @ApiErrors(400)
  async list(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: PageQuery,
  ): Promise<Page<TagBody>> {
    return paginate(await this.tags.listar(user.id), query);
  }

  @Post()
  @ApiDataV2(Tag, { status: 201 })
  @ApiErrors(400, 409)
  create(@CurrentUser() user: AuthenticatedUser, @Body() input: UpsertTagDto): Promise<TagBody> {
    return this.tags.obtenerOCrear(user.id, input.name, input.color);
  }

  @Patch(':id')
  @ApiDataV2(Tag)
  @ApiErrors(400, 404, 409)
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseBigIntPipe) id: bigint,
    @Body() input: UpsertTagDto,
  ): Promise<TagBody> {
    return this.tags.actualizar(user.id, id, input);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContent()
  @ApiErrors(400, 404)
  remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseBigIntPipe) id: bigint,
  ): Promise<void> {
    return this.tags.eliminar(user.id, id);
  }
}
