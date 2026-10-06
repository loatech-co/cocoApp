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

import { CategoriesService } from './categories.service';
import {
  CreateCategoryDto,
  UnificarCategoriaDto,
  ListCategoriesQueryDto,
  ReorderCategoriesDto,
  UpdateCategoryDto,
} from './dto/category.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ParseBigIntPipe } from '../../common/pipes/parse-bigint.pipe';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';
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
import {
  categoryMergeV1,
  categorySeedV1,
  categoryTreeV1,
  categoryUsageV1,
  categoryV1,
  type CategoryRecordV1,
  type CategoryV1,
} from '../../presenters/v1/categories.presenter';

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
  async listar(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ListCategoriesQueryDto,
  ): Promise<{ data: CategoryV1[]; meta: { total: number } }> {
    const tree = await this.categories.listarArbol(user.id, {
      kind: query.kind,
      incluirArchivadas: query.include_archived ?? false,
    });
    return categoryTreeV1(tree);
  }

  @Get(':id')
  @ApiData(CategoryResponse)
  @ApiErrors(400, 404)
  async obtener(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseBigIntPipe) id: bigint,
  ): Promise<CategoryV1> {
    return categoryV1(await this.categories.obtener(user.id, id));
  }

  @Post()
  @ApiData(CategoryResponse, { status: 201 })
  @ApiErrors(400, 404, 409, 422)
  async crear(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateCategoryDto,
  ): Promise<CategoryV1> {
    return categoryV1(await this.categories.crear(user.id, dto));
  }

  /** Siembra el diccionario sugerido. Opcional: el usuario decide si lo quiere. */
  @Post('seed')
  @ApiData(CategorySeedResponse, { status: 201 })
  async sembrar(@CurrentUser() user: AuthenticatedUser): Promise<{ creadas: number }> {
    return categorySeedV1(await this.categories.sembrarDiccionario(user.id));
  }

  @Post('reorder')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContent()
  @ApiErrors(400, 404)
  reordenar(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: ReorderCategoriesDto,
  ): Promise<void> {
    return this.categories.reordenar(user.id, dto);
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
  async unificar(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseBigIntPipe) id: bigint,
    @Body() dto: UnificarCategoriaDto,
  ): Promise<{ movidos: number; destino: CategoryRecordV1 }> {
    return categoryMergeV1(await this.categories.unificar(user.id, id, BigInt(dto.destino_id)));
  }

  @Patch(':id')
  @ApiData(CategoryResponse)
  @ApiErrors(400, 404, 409, 422)
  async actualizar(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseBigIntPipe) id: bigint,
    @Body() dto: UpdateCategoryDto,
  ): Promise<CategoryV1> {
    return categoryV1(await this.categories.actualizar(user.id, id, dto));
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
  async usos(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseBigIntPipe) id: bigint,
  ): Promise<{ movimientos: number; subcategorias: number }> {
    return categoryUsageV1(await this.categories.usosDe(user.id, id));
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
  async eliminar(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseBigIntPipe) id: bigint,
    @Query('reasignar_a') reasignarA?: string,
  ): Promise<void> {
    await this.categories.eliminar(
      user.id,
      id,
      reasignarA === undefined || reasignarA === '' ? undefined : BigInt(reasignarA),
    );
  }
}
