import { Body, Controller, Get, Global, Injectable, Module, Patch } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { IsBoolean, IsOptional } from 'class-validator';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';
import { PrismaService } from '../../prisma/prisma.service';
import { CUENTAS_HABILITADAS, combinarConDefectos, type Preferencias } from './preferences';

/**
 * Un campo por preferencia, no un objeto libre.
 *
 * Con `whitelist` y `forbidNonWhitelisted` en el ValidationPipe, esto rechaza
 * de plano cualquier clave que no esté declarada — no hace falta validarlo a
 * mano en el servicio.
 */
export class UpdatePreferencesDto {
  @IsOptional()
  @IsBoolean()
  cuentas_habilitadas?: boolean;
}

@Injectable()
export class PreferencesService {
  constructor(private readonly prisma: PrismaService) {}

  async leer(userId: bigint): Promise<Preferencias> {
    const filas = await this.prisma.userPreference.findMany({
      where: { userId },
      select: { prefKey: true, prefValue: true },
    });

    return combinarConDefectos(filas);
  }

  /**
   * Guarda solo lo que venga en el DTO.
   *
   * `upsert` por (user_id, pref_key), que tiene índice único: la operación es
   * idempotente y no hay que preguntar antes si la fila ya existía.
   */
  async actualizar(userId: bigint, cambios: UpdatePreferencesDto): Promise<Preferencias> {
    const entradas = Object.entries(cambios).filter(([, valor]) => valor !== undefined);

    if (entradas.length > 0) {
      await this.prisma.$transaction(
        entradas.map(([clave, valor]) =>
          this.prisma.userPreference.upsert({
            where: { userId_prefKey: { userId, prefKey: clave } },
            create: { userId, prefKey: clave, prefValue: valor as Prisma.InputJsonValue },
            update: { prefValue: valor as Prisma.InputJsonValue },
          }),
        ),
      );
    }

    return this.leer(userId);
  }

  /**
   * Atajo para el resto de la aplicación.
   *
   * Lo consultan el dashboard y el módulo de movimientos para saber si tiene
   * sentido hablar de saldos. Vive aquí para que la respuesta a "¿este usuario
   * lleva cuentas?" tenga una sola fuente.
   */
  async llevaCuentas(userId: bigint): Promise<boolean> {
    return (await this.leer(userId))[CUENTAS_HABILITADAS];
  }
}

@Controller('preferences')
export class PreferencesController {
  constructor(private readonly preferences: PreferencesService) {}

  @Get()
  leer(@CurrentUser() user: AuthenticatedUser): Promise<Preferencias> {
    return this.preferences.leer(user.id);
  }

  @Patch()
  actualizar(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdatePreferencesDto,
  ): Promise<Preferencias> {
    return this.preferences.actualizar(user.id, dto);
  }
}

/** Global: lo consultan varios módulos para saber si las cuentas están activas. */
@Global()
@Module({
  controllers: [PreferencesController],
  providers: [PreferencesService],
  exports: [PreferencesService],
})
export class PreferencesModule {}
