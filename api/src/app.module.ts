import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { join } from 'node:path';

import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';
import { LOGIN_PER_EMAIL } from './common/proxy/login-throttle';
import { AccountsModule } from './modules/accounts/accounts.module';
import { AdminModule } from './modules/admin/admin.module';
import { AuthModule } from './modules/auth/auth.module';
import { JwtAuthGuard } from './modules/auth/jwt-auth.guard';
import { CategoriesModule } from './modules/categories/categories.module';
import { CategorizationModule } from './modules/categorization/categorization.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';
import { HealthModule } from './modules/health/health.module';
import { InterpretationModule } from './modules/interpretation/interpretation.module';
import { PreferencesModule } from './modules/preferences/preferences.module';
import { ReceiptsModule } from './modules/receipts/receipts.module';
import { SpaModule } from './modules/spa/spa.module';
import { TagsModule } from './modules/tags/tags.module';
import { TransactionsModule } from './modules/transactions/transactions.module';
import { PrismaModule } from './prisma/prisma.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      // The path is ABSOLUTE, derived from where this file lives, and not
      // relative to the working directory.
      //
      // Hostinger starts the process with the cwd in the user's HOME, not in
      // the application folder. With a relative path, the app looked for
      // `.env` in the home, did not find it, and Prisma failed at boot with
      // a P1012 that reads as if the URL were misspelled:
      //   "the URL must start with the protocol postgresql://"
      // when in fact the variable simply did not exist.
      //
      // __dirname is `api/dist`, so this points to `api/.env` both in
      // development and compiled.
      //
      // Tests run against their own database, never against the development one.
      envFilePath: join(__dirname, '..', process.env.NODE_ENV === 'test' ? '.env.test' : '.env'),
      cache: true,
    }),

    // Rate limiting. There is a single process, so the in-memory counter is
    // enough; if there were ever several instances, it switches to a shared
    // store without touching the controllers. The sensitive endpoints
    // (sign-up, login) also carry their own, stricter @Throttle.
    // Login also counts per email, whatever the IP (`login-throttle.ts`).
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 120 }, LOGIN_PER_EMAIL]),

    PrismaModule,
    AuthModule,
    HealthModule,
    AdminModule,

    // The core. Everything else derives from these.
    AccountsModule,
    CategoriesModule,
    TagsModule,
    TransactionsModule,
    InterpretationModule,
    ReceiptsModule,
    DashboardModule,

    // Preferences: among other things, decides whether this user keeps accounts.
    // It goes before the core because several modules query it.
    PreferencesModule,

    // Phase 2 — import and automatic categorization.
    CategorizationModule,

    // The compiled SPA, served by this same process. It goes LAST: its
    // wildcard route has to yield to every API route.
    SpaModule.forRoot(),
  ],
  providers: [
    // The order matters: first the rate is limited (so that a burst without
    // a token does not even get to query the database), then it authenticates.
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },

    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    { provide: APP_INTERCEPTOR, useClass: TransformInterceptor },
  ],
})
export class AppModule {}
