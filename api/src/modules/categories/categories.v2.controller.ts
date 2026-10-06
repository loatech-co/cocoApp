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

import type {
  Category as CategoryBody,
  CategoryChanges,
  CategoryPosition,
  CategoryMerge as MergeBody,
  CategoryNode as NodeBody,
  CategorySeed as SeedBody,
  CategoryUsage as UsageBody,
  NewCategory,
} from './categories.domain';
import { CategoriesService } from './categories.service';
import {
  CreateCategoryInput,
  DeleteCategoryQuery,
  ListCategoriesQuery,
  MergeCategoryInput,
  ReorderCategoriesInput,
  UpdateCategoryInput,
} from './dto/v2/categories.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ParseBigIntPipe } from '../../common/pipes/parse-bigint.pipe';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';
import {
  Category,
  CategoryMerge,
  CategoryNode,
  CategorySeed,
  CategoryUsage,
} from '../../contract/v2/categories.response';
import {
  ApiAuthenticated,
  ApiErrors,
  ApiNoContent,
  ApiDataV2,
} from '../../contract/v2/openapi.decorators';
import { paginate, type Page } from '../../contract/v2/pagination';
import { defined, type V1Draft } from '../../contract/v2/v1-input';
import {
  categoryMergeV2,
  categoryNodeV2,
  categorySeedV2,
  categoryUsageV2,
  categoryV2,
} from '../../presenters/v2/categories.presenter';

type SharedFields = Omit<CategoryChanges, 'name' | 'kind' | 'parentId' | 'isArchived'>;

/** The fields created and edited categories share. */
function fieldsOf(input: CreateCategoryInput | UpdateCategoryInput): SharedFields {
  return defined<V1Draft<SharedFields>>({
    color: input.color,
    icon: input.icon,
    sortOrder: input.sortOrder,
    isRecurring: input.isRecurring,
    isStatic: input.isStatic,
    periodicity: input.periodicity,
    paymentDay: input.paymentDay,
    paymentMonth: input.paymentMonth,
    isAutoPaid: input.isAutoPaid,
    isMultiPayment: input.isMultiPayment,
    budget: input.budget,
    keywords: input.keywords,
  });
}

function newCategoryOf(input: CreateCategoryInput): NewCategory {
  return {
    ...fieldsOf(input),
    ...defined<V1Draft<NewCategory>>({
      parentId: input.parentId === undefined ? undefined : BigInt(input.parentId),
    }),
    name: input.name,
    kind: input.kind,
  };
}

function changesOf(input: UpdateCategoryInput): CategoryChanges {
  return {
    ...fieldsOf(input),
    ...defined<V1Draft<CategoryChanges>>({
      name: input.name,
      kind: input.kind,
      parentId:
        input.parentId === undefined || input.parentId === null
          ? input.parentId
          : BigInt(input.parentId),
      isArchived: input.isArchived,
    }),
  };
}

function positionsOf(input: ReorderCategoriesInput): CategoryPosition[] {
  return input.items.map(({ id, sortOrder }) => ({ id: BigInt(id), sortOrder }));
}

/**
 * v2 of the cost-center tree: the same service, translated at the edge.
 *
 * The list is the tree, paged by its roots (the cost centers): each comes
 * with everything that hangs from it, and `meta.total` counts cost centers.
 */
@ApiAuthenticated()
@Controller({ path: 'categories', version: '2' })
export class CategoriesV2Controller {
  constructor(private readonly categories: CategoriesService) {}

  @Get()
  @ApiDataV2(CategoryNode, {
    isPage: true,
    description: 'The tree, a page of cost centers each with its `children`.',
  })
  @ApiErrors(400)
  async list(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ListCategoriesQuery,
  ): Promise<Page<NodeBody>> {
    const { tree } = await this.categories.listTree(user.id, {
      kind: query.kind,
      includeArchived: query.includeArchived ?? false,
    });
    return paginate(tree.map(categoryNodeV2), query);
  }

  @Get(':id')
  @ApiDataV2(Category)
  @ApiErrors(400, 404)
  async get(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseBigIntPipe) id: bigint,
  ): Promise<CategoryBody> {
    return categoryV2(await this.categories.get(user.id, id));
  }

  @Post()
  @ApiDataV2(Category, { status: 201 })
  @ApiErrors(400, 404, 409, 422)
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() input: CreateCategoryInput,
  ): Promise<CategoryBody> {
    return categoryV2(await this.categories.create(user.id, newCategoryOf(input)));
  }

  /** Creates the starter tree for a user who has none. */
  @Post('seed')
  @ApiDataV2(CategorySeed, { status: 201 })
  async seed(@CurrentUser() user: AuthenticatedUser): Promise<SeedBody> {
    return categorySeedV2(await this.categories.seed(user.id));
  }

  @Post('reorder')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContent()
  @ApiErrors(400, 404)
  reorder(
    @CurrentUser() user: AuthenticatedUser,
    @Body() input: ReorderCategoriesInput,
  ): Promise<void> {
    return this.categories.reorder(user.id, positionsOf(input));
  }

  /** Moves every transaction of this concept to `targetId` and removes this one. */
  @Post(':id/merge')
  @ApiDataV2(CategoryMerge, { status: 201 })
  @ApiErrors(400, 404, 409, 422)
  async merge(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseBigIntPipe) id: bigint,
    @Body() input: MergeCategoryInput,
  ): Promise<MergeBody> {
    return categoryMergeV2(await this.categories.merge(user.id, id, BigInt(input.targetId)));
  }

  @Patch(':id')
  @ApiDataV2(Category)
  @ApiErrors(400, 404, 409, 422)
  async update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseBigIntPipe) id: bigint,
    @Body() input: UpdateCategoryInput,
  ): Promise<CategoryBody> {
    return categoryV2(await this.categories.update(user.id, id, changesOf(input)));
  }

  /** What deleting it would take with it: the transactions and categories below. */
  @Get(':id/usage')
  @ApiDataV2(CategoryUsage)
  @ApiErrors(400, 404)
  async usage(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseBigIntPipe) id: bigint,
  ): Promise<UsageBody> {
    return categoryUsageV2(await this.categories.usageOf(user.id, id));
  }

  /** Deletes the whole subtree; its transactions go to `reassignTo`. */
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContent()
  @ApiErrors(400, 404, 409, 422)
  async remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseBigIntPipe) id: bigint,
    @Query() query: DeleteCategoryQuery,
  ): Promise<void> {
    await this.categories.remove(
      user.id,
      id,
      query.reassignTo === undefined ? undefined : BigInt(query.reassignTo),
    );
  }
}
