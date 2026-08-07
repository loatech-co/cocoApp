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

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ParseBigIntPipe } from '../../common/pipes/parse-bigint.pipe';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';
import { CategoriesService, type CategoryView } from './categories.service';
import type { ConHijos } from './categories.tree';
import {
  CreateCategoryDto,
  ListCategoriesQueryDto,
  ReorderCategoriesDto,
  UpdateCategoryDto,
} from './dto/category.dto';

/** Forma pública: `parent_id` en snake_case, como el resto del contrato. */
interface CategoryPayload {
  id: bigint;
  name: string;
  parent_id: bigint | null;
  kind: CategoryView['kind'];
  color: string | null;
  icon: string | null;
  sort_order: number;
  is_archived: boolean;
  children?: CategoryPayload[];
}

function aPayload(categoria: CategoryView | ConHijos<CategoryView>): CategoryPayload {
  const payload: CategoryPayload = {
    id: categoria.id,
    name: categoria.name,
    parent_id: categoria.parentId,
    kind: categoria.kind,
    color: categoria.color,
    icon: categoria.icon,
    sort_order: categoria.sort_order,
    is_archived: categoria.is_archived,
  };

  if ('children' in categoria) {
    payload.children = categoria.children.map(aPayload);
  }

  return payload;
}

/** M2 — Categorías. */
@Controller('categories')
export class CategoriesController {
  constructor(private readonly categories: CategoriesService) {}

  @Get()
  async listar(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ListCategoriesQueryDto,
  ): Promise<{ data: CategoryPayload[]; meta: { total: number } }> {
    const { arbol, total } = await this.categories.listarArbol(user.id, {
      kind: query.kind,
      incluirArchivadas: query.include_archived ?? false,
    });

    return { data: arbol.map(aPayload), meta: { total } };
  }

  @Get(':id')
  async obtener(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseBigIntPipe) id: bigint,
  ): Promise<CategoryPayload> {
    return aPayload(await this.categories.obtener(user.id, id));
  }

  @Post()
  async crear(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateCategoryDto,
  ): Promise<CategoryPayload> {
    return aPayload(await this.categories.crear(user.id, dto));
  }

  /** Siembra el diccionario sugerido. Opcional: el usuario decide si lo quiere. */
  @Post('seed')
  sembrar(@CurrentUser() user: AuthenticatedUser): Promise<{ creadas: number }> {
    return this.categories.sembrarDiccionario(user.id);
  }

  @Post('reorder')
  @HttpCode(HttpStatus.NO_CONTENT)
  reordenar(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: ReorderCategoriesDto,
  ): Promise<void> {
    return this.categories.reordenar(user.id, dto);
  }

  @Patch(':id')
  async actualizar(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseBigIntPipe) id: bigint,
    @Body() dto: UpdateCategoryDto,
  ): Promise<CategoryPayload> {
    return aPayload(await this.categories.actualizar(user.id, id, dto));
  }

  /**
   * Archiva. Solo borra físicamente si la categoría nunca se usó — y en ese
   * caso el servicio lo decide, no el cliente.
   */
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async archivar(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseBigIntPipe) id: bigint,
    @Query('cascade') cascade?: string,
  ): Promise<void> {
    await this.categories.archivar(user.id, id, cascade === 'true');
  }
}
