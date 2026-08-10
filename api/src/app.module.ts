import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';

import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';
import { AccountsModule } from './modules/accounts/accounts.module';
import { AdminModule } from './modules/admin/admin.module';
import { AuthModule } from './modules/auth/auth.module';
import { CategoriesModule } from './modules/categories/categories.module';
import { CategorizationModule } from './modules/categorization/categorization.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';
import { HealthModule } from './modules/health/health.module';
import { ImportsModule } from './modules/imports/imports.module';
import { PreferencesModule } from './modules/preferences/preferences.module';
import { TagsModule } from './modules/tags/tags.module';
import { TransactionsModule } from './modules/transactions/transactions.module';
import { SpaModule } from './modules/spa/spa.module';
import { PrismaModule } from './prisma/prisma.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      // Las pruebas corren contra su propia base, nunca contra la de desarrollo.
      envFilePath: process.env.NODE_ENV === 'test' ? '.env.test' : '.env',
      cache: true,
    }),

    // Rate limiting. El proceso es único, así que el contador en memoria
    // alcanza; si algún día hubiera varias instancias, se cambia a un store
    // compartido sin tocar los controladores. Los endpoints sensibles
    // (registro, login) llevan además su propio @Throttle más estricto.
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 120 }]),

    PrismaModule,
    AuthModule,
    HealthModule,
    AdminModule,

    // El núcleo. Todo lo demás se deriva de estos.
    AccountsModule,
    CategoriesModule,
    TagsModule,
    TransactionsModule,
    DashboardModule,

    // Preferencias: entre otras cosas, decide si este usuario lleva cuentas.
    // Va antes que el núcleo porque varios módulos la consultan.
    PreferencesModule,

    // Fase 2 — importación y categorización automática.
    CategorizationModule,
    ImportsModule,

    // La SPA compilada, servida por este mismo proceso. Va AL FINAL: su ruta
    // comodín tiene que ceder ante todas las de la API.
    SpaModule.forRoot(),
  ],
  providers: [
    // El orden importa: primero se limita la tasa (para que una ráfaga sin
    // token ni siquiera llegue a consultar la base), después se autentica.
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },

    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    { provide: APP_INTERCEPTOR, useClass: TransformInterceptor },
  ],
})
export class AppModule {}
