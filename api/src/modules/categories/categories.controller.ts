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

import { CategoriesService, type CategoryView } from './categories.service';
import type { ConHijos } from './categories.tree';
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

/** Forma pública: `parent_id` en snake_case, como el resto del contrato. */
/**
 * Lo que sale por la API: la vista del servicio, con el padre en snake_case.
 *
 * ── Se DERIVA de `CategoryView`, no se vuelve a escribir ────────────────────
 * Era una copia a mano, campo por campo, y con ella una función que también
 * los nombraba uno a uno. Dos listas paralelas que nada obligaba a coincidir:
 * un campo nuevo en el modelo llegaba al servicio, se guardaba en la base, y
 * se caía aquí sin ruido. La API devolvía 200, el formulario lo releía vacío y
 * al siguiente guardado lo borraba.
 *
 * Pasó con `presupuesto` y `pago_automatico`, los dos a la vez, y el comentario
 * que había aquí ya avisaba de que iba a pasar. Un aviso no es una defensa.
 *
 * El filtro de verdad sigue existiendo y está donde debe: `presentar()`, en el
 * servicio, que elige a mano qué columnas del modelo se publican. Esto de aquí
 * no era una segunda puerta, era una copia de la primera.
 */
type CategoryPayload = Omit<CategoryView, 'parentId'> & {
  parent_id: bigint | null;
  children?: CategoryPayload[];
};

/**
 * La vista del servicio, tal cual, con dos únicos cambios.
 *
 * `parentId` pasa a `parent_id`, que es el nombre con el que sale todo lo
 * demás; y los hijos se recorren para que a ellos les pase lo mismo. Nada más
 * se nombra: lo que el servicio publique, sale.
 */
export function aPayload(categoria: CategoryView | ConHijos<CategoryView>): CategoryPayload {
  // Un nodo suelto no trae `children`; uno del árbol, sí.
  const nodo: CategoryView & { children?: ConHijos<CategoryView>[] } = categoria;
  const { parentId, children, ...resto } = nodo;
  const payload: CategoryPayload = { ...resto, parent_id: parentId };

  if (children !== undefined) {
    payload.children = children.map(aPayload);
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

  /**
   * Funde un concepto en otro.
   *
   * Va antes de `:id` en el archivo por costumbre, pero aquí no hace falta:
   * la ruta lleva un segmento propio después del identificador, así que no
   * puede confundirse con ninguna otra.
   */
  @Post(':id/unificar')
  unificar(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseBigIntPipe) id: bigint,
    @Body() dto: UnificarCategoriaDto,
  ): Promise<{ movidos: number; destino: CategoryView }> {
    return this.categories.unificar(user.id, id, BigInt(dto.destino_id));
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
  /**
   * Cuánto arrastra un borrado, antes de hacerlo.
   *
   * Lo pregunta la interfaz al abrir la confirmación, para poder decir cuántos
   * movimientos se van a mover y pedir a dónde. Sin esto, borrar sería a
   * ciegas o habría que enterarse por el error —que llega después de pulsar
   * «Eliminar»—.
   */
  @Get(':id/usos')
  async usos(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseBigIntPipe) id: bigint,
  ): Promise<{ movimientos: number; subcategorias: number }> {
    return this.categories.usosDe(user.id, id);
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
