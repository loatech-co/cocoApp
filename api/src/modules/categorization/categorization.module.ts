import {
  Body,
  Controller,
  Get,
  Global,
  Injectable,
  Module,
  Post,
  Query,
  UnprocessableEntityException,
} from '@nestjs/common';
import { IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';
import { PrismaService } from '../../prisma/prisma.service';
import { normalizarDescripcion } from '../imports/fingerprint';
import {
  patronParaAprender,
  sugerirCategoria,
  type AntecedenteHistorico,
  type ReglaDeCategoria,
  type Sugerencia,
} from './categorization';

/**
 * Cuántos movimientos ya categorizados se leen para aprender.
 *
 * Suficientes para que el patrón de alguien se note, y bastante menos que "todo
 * el historial": traer diez mil filas en cada sugerencia sería absurdo, y los
 * movimientos recientes describen mejor cómo organiza sus finanzas HOY.
 */
const ANTECEDENTES_A_LEER = 400;

/**
 * Prioridad con la que nacen las reglas sembradas por defecto, frente a las que
 * la persona crea o confirma. La diferencia no es decorativa: decide quién gana
 * cuando dos reglas coinciden, y con qué confianza se muestra la sugerencia.
 */
export const PRIORIDAD_SEMBRADA = 0;
export const PRIORIDAD_APRENDIDA = 10;

export class SuggestQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(255)
  description?: string;
}

/** Lo que la ficha manda al guardar un movimiento con una sugerencia aceptada o corregida. */
export class LearnBodyDto {
  @IsString()
  @MaxLength(255)
  description!: string;

  @IsInt()
  @Min(1)
  category_id!: number;
}

export interface SugerenciaView {
  category_id: number;
  confidence: number;
  reason: Sugerencia['motivo'];
}

@Injectable()
export class CategorizationService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Sugiere categoría para una descripción suelta (la captura rápida).
   *
   * Para varias descripciones a la vez —una importación entera— se usa
   * `prepararContexto` + `sugerirParaLote`: leer el historial una sola vez en
   * lugar de una por fila.
   */
  async sugerirPara(userId: bigint, descripcion: string): Promise<SugerenciaView | null> {
    const contexto = await this.prepararContexto(userId);
    return aVista(sugerirCategoria(descripcion, contexto));
  }

  /**
   * Lee de una sola vez todo lo que hace falta para categorizar.
   *
   * Se separa a propósito: una importación de cuarenta filas debe costar dos
   * consultas, no ochenta.
   */
  async prepararContexto(userId: bigint): Promise<{
    historial: AntecedenteHistorico[];
    reglas: ReglaDeCategoria[];
  }> {
    const [movimientos, reglas] = await Promise.all([
      this.prisma.transaction.findMany({
        where: { userId, categoryId: { not: null }, description: { not: null } },
        select: { description: true, categoryId: true },
        orderBy: { date: 'desc' },
        take: ANTECEDENTES_A_LEER,
      }),
      this.prisma.categoryRule.findMany({
        where: { userId },
        select: { pattern: true, categoryId: true, priority: true },
      }),
    ]);

    return {
      historial: movimientos.map((movimiento) => ({
        description: movimiento.description,
        // El filtro garantiza que no es null; TypeScript no puede saberlo.
        categoryId: movimiento.categoryId as bigint,
      })),
      reglas: reglas.map((regla) => ({
        ...regla,
        sembrada: regla.priority === PRIORIDAD_SEMBRADA,
      })),
    };
  }

  /**
   * Registra que una sugerencia se aceptó, creando o reforzando una regla.
   *
   * Es lo que hace que el sistema mejore con el uso sin pedirle nada a nadie:
   * la próxima importación acertará más porque esta se corrigió.
   */
  async aprenderDe(userId: bigint, descripcion: string, categoryId: bigint): Promise<boolean> {
    const patron = patronParaAprender(descripcion, normalizarDescripcion);
    if (!patron) return false;

    await this.prisma.categoryRule.upsert({
      where: { userId_pattern: { userId, pattern: patron } },
      create: { userId, pattern: patron, categoryId, priority: PRIORIDAD_APRENDIDA, hits: 1 },
      update: { categoryId, hits: { increment: 1 } },
    });
    return true;
  }

  /**
   * Lo mismo, pero desde la ficha: comprueba antes que la categoría sea suya.
   *
   * `aprenderDe` confía en quien lo llama porque la importación ya validó sus
   * filas. Desde la ficha llega un `category_id` escrito por el cliente, y sin
   * esta comprobación alguien podría crear una regla que apunte a la categoría
   * de otra cuenta —inútil para él, pero una fila que no debería existir—.
   */
  async aprenderDesdeLaFicha(
    userId: bigint,
    descripcion: string,
    categoryId: bigint,
  ): Promise<{ aprendido: boolean }> {
    const suya = await this.prisma.category.findFirst({
      where: { id: categoryId, userId },
      select: { id: true },
    });
    if (!suya) throw new UnprocessableEntityException('Esa categoría no existe en tu cuenta.');

    return { aprendido: await this.aprenderDe(userId, descripcion, categoryId) };
  }
}

function aVista(sugerencia: Sugerencia | null): SugerenciaView | null {
  return sugerencia
    ? {
        category_id: Number(sugerencia.categoryId),
        confidence: sugerencia.confidence,
        reason: sugerencia.motivo,
      }
    : null;
}

@Controller('categorization')
export class CategorizationController {
  constructor(private readonly categorization: CategorizationService) {}

  /**
   * Sugerencia para lo que se está escribiendo en la captura rápida.
   *
   * Devuelve `{ data: null }` cuando no hay nada seguro que decir. La interfaz
   * simplemente no muestra nada — sugerir mal es peor que no sugerir.
   */
  @Get('suggest')
  async sugerir(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: SuggestQueryDto,
  ): Promise<{ data: SugerenciaView | null; meta: Record<string, never> }> {
    // Se arma el envelope a mano: el TransformInterceptor deja pasar `null`
    // tal cual, y la respuesta saldría con el cuerpo vacío en vez de con la
    // forma `{ data, meta }` que el cliente espera de TODA respuesta.
    const data = query.description?.trim()
      ? await this.categorization.sugerirPara(user.id, query.description)
      : null;

    return { data, meta: {} };
  }

  /**
   * La ficha avisa de que una sugerencia se aceptó o se corrigió.
   *
   * Solo entonces: un movimiento clasificado a mano sin que hubiera sugerencia
   * no pasa por aquí, y uno con descripción genérica no deja regla aunque pase.
   * Devuelve si aprendió algo, para que quien lo llama no tenga que adivinar.
   */
  @Post('learn')
  async aprender(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: LearnBodyDto,
  ): Promise<{ aprendido: boolean }> {
    return this.categorization.aprenderDesdeLaFicha(
      user.id,
      body.description,
      BigInt(body.category_id),
    );
  }
}

/**
 * Global porque el módulo de importación necesita el servicio, y en el futuro
 * también lo necesitará el de conceptos fijos.
 */
@Global()
@Module({
  controllers: [CategorizationController],
  providers: [CategorizationService],
  exports: [CategorizationService],
})
export class CategorizationModule {}
