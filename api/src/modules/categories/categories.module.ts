import { Module } from '@nestjs/common';

import { CategoriesController } from './categories.controller';
import { CategoriesRepository } from './categories.repository';
import { CategoriesService } from './categories.service';
import { CategoryLookupRepository } from './category-lookup.repository';
import { CategoryLookupService } from './category-lookup.service';

@Module({
  controllers: [CategoriesController],
  providers: [
    CategoriesService,
    CategoriesRepository,
    CategoryLookupService,
    CategoryLookupRepository,
  ],
  exports: [CategoriesService, CategoryLookupService],
})
export class CategoriesModule {}
