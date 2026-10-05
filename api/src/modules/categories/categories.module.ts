import { Module } from '@nestjs/common';

import { CategoriesController } from './categories.controller';
import { CategoriesRepository } from './categories.repository';
import { CategoriesService } from './categories.service';
import { CategoriesV2Controller } from './categories.v2.controller';
import { CategoryLookupRepository } from './category-lookup.repository';
import { CategoryLookupService } from './category-lookup.service';

@Module({
  controllers: [CategoriesController, CategoriesV2Controller],
  providers: [
    CategoriesService,
    CategoriesRepository,
    CategoryLookupService,
    CategoryLookupRepository,
  ],
  exports: [CategoriesService, CategoryLookupService],
})
export class CategoriesModule {}
