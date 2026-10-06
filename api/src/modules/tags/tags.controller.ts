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
import { TagsService, type Tag } from './tags.service';
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
import { tagListV1, type TagListV1 } from '../../presenters/v1/tags.presenter';

/** M2 — Cross-cutting tags. */
@ApiAuthenticated()
@Controller('tags')
export class TagsController {
  constructor(private readonly tags: TagsService) {}

  @Get()
  @ApiData(TagResponse, { isArray: true, meta: 'total' })
  async list(@CurrentUser() user: AuthenticatedUser): Promise<TagListV1> {
    return tagListV1(await this.tags.list(user.id));
  }

  @Post()
  @ApiData(TagResponse, { status: 201 })
  @ApiErrors(400, 409)
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: UpsertTagDto): Promise<Tag> {
    return this.tags.getOrCreate(user.id, dto.name, dto.color);
  }

  @Patch(':id')
  @ApiData(TagResponse)
  @ApiErrors(400, 404, 409)
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseBigIntPipe) id: bigint,
    @Body() dto: UpsertTagDto,
  ): Promise<Tag> {
    return this.tags.update(user.id, id, dto);
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
