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
  CategoryMerge as MergeBody,
  CategoryNode as NodeBody,
  CategorySeed as SeedBody,
  CategoryUsage as UsageBody,
} from './categories.domain';
import { CategoriesService } from './categories.service';
import type {
  CreateCategoryDto,
  ReorderCategoriesDto,
  UpdateCategoryDto,
} from './dto/category.dto';
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
import { PERIODICITY, spanish } from '../../common/vocabulary';
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

type V1Fields = Omit<UpdateCategoryDto, 'name' | 'kind' | 'parent_id' | 'is_archived'>;

/** The fields created and edited categories share, in their v1 names and words. */
function fields(input: CreateCategoryInput | UpdateCategoryInput): V1Fields {
  return defined<V1Draft<V1Fields>>({
    color: input.color,
    icon: input.icon,
    sort_order: input.sortOrder,
    recurrente: input.isRecurring,
    estatico: input.isStatic,
    periodicidad:
      input.periodicity === undefined || input.periodicity === null
        ? input.periodicity
        : spanish(PERIODICITY, input.periodicity),
    dia_de_pago: input.paymentDay,
    mes_de_pago: input.paymentMonth,
    pago_automatico: input.isAutoPaid,
    varios_pagos: input.isMultiPayment,
    presupuesto: input.budget,
    palabras_clave: input.keywords,
  });
}

function createCategory(input: CreateCategoryInput): CreateCategoryDto {
  return {
    ...fields(input),
    ...defined<V1Draft<CreateCategoryDto>>({ parent_id: input.parentId }),
    name: input.name,
    kind: input.kind,
  };
}

function updateCategory(input: UpdateCategoryInput): UpdateCategoryDto {
  return {
    ...fields(input),
    ...defined<V1Draft<UpdateCategoryDto>>({
      name: input.name,
      kind: input.kind,
      parent_id: input.parentId,
      is_archived: input.isArchived,
    }),
  };
}

function reorder(input: ReorderCategoriesInput): ReorderCategoriesDto {
  return { items: input.items.map(({ id, sortOrder }) => ({ id, sort_order: sortOrder })) };
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
    const { tree } = await this.categories.listarArbol(user.id, {
      kind: query.kind,
      incluirArchivadas: query.includeArchived ?? false,
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
    return categoryV2(await this.categories.obtener(user.id, id));
  }

  @Post()
  @ApiDataV2(Category, { status: 201 })
  @ApiErrors(400, 404, 409, 422)
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() input: CreateCategoryInput,
  ): Promise<CategoryBody> {
    return categoryV2(await this.categories.crear(user.id, createCategory(input)));
  }

  /** Creates the starter tree for a user who has none. */
  @Post('seed')
  @ApiDataV2(CategorySeed, { status: 201 })
  async seed(@CurrentUser() user: AuthenticatedUser): Promise<SeedBody> {
    return categorySeedV2(await this.categories.sembrarDiccionario(user.id));
  }

  @Post('reorder')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContent()
  @ApiErrors(400, 404)
  reorder(
    @CurrentUser() user: AuthenticatedUser,
    @Body() input: ReorderCategoriesInput,
  ): Promise<void> {
    return this.categories.reordenar(user.id, reorder(input));
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
    return categoryMergeV2(await this.categories.unificar(user.id, id, BigInt(input.targetId)));
  }

  @Patch(':id')
  @ApiDataV2(Category)
  @ApiErrors(400, 404, 409, 422)
  async update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseBigIntPipe) id: bigint,
    @Body() input: UpdateCategoryInput,
  ): Promise<CategoryBody> {
    return categoryV2(await this.categories.actualizar(user.id, id, updateCategory(input)));
  }

  /** What deleting it would take with it: the transactions and categories below. */
  @Get(':id/usage')
  @ApiDataV2(CategoryUsage)
  @ApiErrors(400, 404)
  async usage(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseBigIntPipe) id: bigint,
  ): Promise<UsageBody> {
    return categoryUsageV2(await this.categories.usosDe(user.id, id));
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
    await this.categories.eliminar(
      user.id,
      id,
      query.reassignTo === undefined ? undefined : BigInt(query.reassignTo),
    );
  }
}
