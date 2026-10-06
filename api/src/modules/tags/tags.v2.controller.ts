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

import { UpsertTagDto } from './dto/v2/tags.dto';
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
 * The tags. Every list is a page.
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
    return paginate(await this.tags.list(user.id), query);
  }

  @Post()
  @ApiDataV2(Tag, { status: 201 })
  @ApiErrors(400, 409)
  create(@CurrentUser() user: AuthenticatedUser, @Body() input: UpsertTagDto): Promise<TagBody> {
    return this.tags.getOrCreate(user.id, input.name, input.color);
  }

  @Patch(':id')
  @ApiDataV2(Tag)
  @ApiErrors(400, 404, 409)
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseBigIntPipe) id: bigint,
    @Body() input: UpsertTagDto,
  ): Promise<TagBody> {
    return this.tags.update(user.id, id, input);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContent()
  @ApiErrors(400, 404)
  remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseBigIntPipe) id: bigint,
  ): Promise<void> {
    return this.tags.remove(user.id, id);
  }
}
