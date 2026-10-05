import { Module } from '@nestjs/common';

import { TagsController } from './tags.controller';
import { TagsRepository } from './tags.repository';
import { TagsService } from './tags.service';
import { TagsV2Controller } from './tags.v2.controller';

@Module({
  controllers: [TagsController, TagsV2Controller],
  providers: [TagsService, TagsRepository],
  exports: [TagsService],
})
export class TagsModule {}
