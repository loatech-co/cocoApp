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

import type { CategoryChanges, NewCategory } from './categories.domain';
import { CategoriesService } from './categories.service';
import {
  CreateCategoryDto,
  MergeCategoryDto,
  ListCategoriesQueryDto,
  ReorderCategoriesDto,
  UpdateCategoryDto,
} from './dto/category.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ParseBigIntPipe } from '../../common/pipes/parse-bigint.pipe';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';
import { english, PERIODICITY } from '../../common/vocabulary';
import {
  CategoryMergeResponse,
  CategoryResponse,
  CategorySeedResponse,
  CategoryUsageResponse,
} from '../../contract/v1/categories.response';
import {
  ApiAuthenticated,
  ApiData,
  ApiErrors,
  ApiNoContent,
} from '../../contract/v1/openapi.decorators';
import { defined, type V1Draft } from '../../contract/v2/v1-input';
import {
  categoryMergeV1,
  categorySeedV1,
  categoryTreeV1,
  categoryUsageV1,
  categoryV1,
  type CategoryV1,
} from '../../presenters/v1/categories.presenter';

type SharedFields = Omit<CategoryChanges, 'name' | 'kind' | 'parentId' | 'isArchived'>;

/** The fields created and edited categories share, from their v1 names and words. */
function fieldsOf(dto: CreateCategoryDto | UpdateCategoryDto): SharedFields {
  return defined<V1Draft<SharedFields>>({
    color: dto.color,
    icon: dto.icon,
    sortOrder: dto.sort_order,
    isRecurring: dto.recurrente,
    isStatic: dto.estatico,
    periodicity:
      dto.periodicidad === undefined || dto.periodicidad === null
        ? dto.periodicidad
        : english(PERIODICITY, dto.periodicidad),
    paymentDay: dto.dia_de_pago,
    paymentMonth: dto.mes_de_pago,
    isAutoPaid: dto.pago_automatico,
    isMultiPayment: dto.varios_pagos,
    budget: dto.presupuesto,
    keywords: dto.palabras_clave,
  });
}

function newCategoryOf(dto: CreateCategoryDto): NewCategory {
  return {
    ...fieldsOf(dto),
    ...defined<V1Draft<NewCategory>>({
      parentId: dto.parent_id === undefined ? undefined : BigInt(dto.parent_id),
    }),
    name: dto.name,
    kind: dto.kind,
  };
}

function changesOf(dto: UpdateCategoryDto): CategoryChanges {
  return {
    ...fieldsOf(dto),
    ...defined<V1Draft<CategoryChanges>>({
      name: dto.name,
      kind: dto.kind,
      parentId:
        dto.parent_id === undefined || dto.parent_id === null
          ? dto.parent_id
          : BigInt(dto.parent_id),
      isArchived: dto.is_archived,
    }),
  };
}

@ApiAuthenticated()
@Controller('categories')
export class CategoriesController {
  constructor(private readonly categories: CategoriesService) {}

  @Get()
  @ApiData(CategoryResponse, {
    isArray: true,
    meta: 'total',
    description: 'The tree: cost centers with their `children`. `meta.total` counts every node.',
  })
  @ApiErrors(400)
  async list(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ListCategoriesQueryDto,
  ): Promise<{ data: CategoryV1[]; meta: { total: number } }> {
    const tree = await this.categories.listTree(user.id, {
      kind: query.kind,
      includeArchived: query.include_archived ?? false,
    });
    return categoryTreeV1(tree);
  }

  @Get(':id')
  @ApiData(CategoryResponse)
  @ApiErrors(400, 404)
  async get(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseBigIntPipe) id: bigint,
  ): Promise<CategoryV1> {
    return categoryV1(await this.categories.get(user.id, id));
  }

  @Post()
  @ApiData(CategoryResponse, { status: 201 })
  @ApiErrors(400, 404, 409, 422)
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateCategoryDto,
  ): Promise<CategoryV1> {
    return categoryV1(await this.categories.create(user.id, newCategoryOf(dto)));
  }

  /** Siembra el diccionario sugerido. Opcional: el usuario decide si lo quiere. */
  @Post('seed')
  @ApiData(CategorySeedResponse, { status: 201 })
  async seed(@CurrentUser() user: AuthenticatedUser): Promise<ReturnType<typeof categorySeedV1>> {
    return categorySeedV1(await this.categories.seed(user.id));
  }

  @Post('reorder')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContent()
  @ApiErrors(400, 404)
  reorder(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: ReorderCategoriesDto,
  ): Promise<void> {
    return this.categories.reorder(
      user.id,
      dto.items.map((item) => ({ id: BigInt(item.id), sortOrder: item.sort_order })),
    );
  }

  /**
   * Funde un concepto en otro.
   *
   * Va antes de `:id` en el archivo por costumbre, pero aquí no hace falta:
   * la ruta lleva un segmento propio después del identificador, así que no
   * puede confundirse con ninguna otra.
   */
  @Post(':id/unificar')
  @ApiData(CategoryMergeResponse, { status: 201 })
  @ApiErrors(400, 404, 409, 422)
  async merge(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseBigIntPipe) id: bigint,
    @Body() dto: MergeCategoryDto,
  ): Promise<ReturnType<typeof categoryMergeV1>> {
    return categoryMergeV1(await this.categories.merge(user.id, id, BigInt(dto.destino_id)));
  }

  @Patch(':id')
  @ApiData(CategoryResponse)
  @ApiErrors(400, 404, 409, 422)
  async update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseBigIntPipe) id: bigint,
    @Body() dto: UpdateCategoryDto,
  ): Promise<CategoryV1> {
    return categoryV1(await this.categories.update(user.id, id, changesOf(dto)));
  }

  /**
   * Archiva. Solo borra físicamente si la categoría nunca se usó — y en ese
   * caso el servicio lo decide, no el cliente.
   */
  /**
   * Cuánto arrastra un borrado, antes de hacerlo.
   *
   * Lo pregunta la interfaz al abrir la confirmación, para poder decir cuántos
   * movimientos se van a mover y pedir a dónde. Sin esto, borrar sería a
   * ciegas o habría que enterarse por el error —que llega después de pulsar
   * «Eliminar»—.
   */
  @Get(':id/usos')
  @ApiData(CategoryUsageResponse)
  @ApiErrors(400, 404)
  async usage(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseBigIntPipe) id: bigint,
  ): Promise<ReturnType<typeof categoryUsageV1>> {
    return categoryUsageV1(await this.categories.usageOf(user.id, id));
  }

  /**
   * BORRA la categoría —y todo lo que cuelga de ella— de verdad.
   *
   * Antes esta ruta archivaba —dejaba la fila con `is_archived`— y el botón de
   * la interfaz decía "eliminar": la categoría desaparecía de las listas y
   * seguía ocupando su nombre, así que crear otra igual chocaba contra una que
   * nadie podía ver.
   *
   * ── `reasignar_a` ────────────────────────────────────────────────────────
   * A dónde pasan sus movimientos. Obligatorio si tiene alguno: el servicio no
   * los adivina, porque adivinar significa mover plata a un sitio que nadie
   * pidió. Sin movimientos no hace falta.
   *
   * Va en la CONSULTA y no en el cuerpo: un DELETE con cuerpo lo admite la
   * especificación pero lo tiran por el camino unos cuantos proxies, y este
   * dato es un identificador, no un documento.
   */
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContent()
  @ApiErrors(400, 404, 409, 422)
  async remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseBigIntPipe) id: bigint,
    @Query('reasignar_a') reassignTo?: string,
  ): Promise<void> {
    await this.categories.remove(
      user.id,
      id,
      reassignTo === undefined || reassignTo === '' ? undefined : BigInt(reassignTo),
    );
  }
}
