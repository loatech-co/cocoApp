import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';

import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { firebaseAdminProvider } from './common/firebase/firebase-admin.provider';
import { FirebaseAuthGuard } from './common/guards/firebase-auth.guard';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';
import { AccountsModule } from './modules/accounts/accounts.module';
import { CategoriesModule } from './modules/categories/categories.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';
import { HealthModule } from './modules/health/health.module';
import { TagsModule } from './modules/tags/tags.module';
import { TransactionsModule } from './modules/transactions/transactions.module';
import { UsersModule } from './modules/users/users.module';
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
    // compartido sin tocar los controladores.
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 120 }]),

    PrismaModule,
    UsersModule,
    HealthModule,

    // Fase 1 — el núcleo. Todo lo demás se deriva de estos.
    AccountsModule,
    CategoriesModule,
    TagsModule,
    TransactionsModule,
    DashboardModule,
  ],
  providers: [
    firebaseAdminProvider,

    // El orden importa: primero se limita la tasa (para que una ráfaga sin
    // token ni siquiera llegue a verificarse contra Firebase), después se
    // autentica.
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: FirebaseAuthGuard },

    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    { provide: APP_INTERCEPTOR, useClass: TransformInterceptor },
  ],
})
export class AppModule {}
