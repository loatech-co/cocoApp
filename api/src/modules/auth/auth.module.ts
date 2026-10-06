import { Global, Module } from '@nestjs/common';

import { AuthService } from './auth.service';
import { AuthV2Controller } from './auth.v2.controller';
import { PasswordService } from './password.service';
import { SupabaseAuthService } from './supabase-auth.service';
import { UsersRepository } from './users.repository';
import { UsersService } from './users.service';
import { AuditRepository } from '../../common/audit/audit.repository';
import { AuditService } from '../../common/audit/audit.service';
import { CategoriesModule } from '../categories/categories.module';
import { FlagsModule } from '../flags/flags.module';

/**
 * Global because the JwtAuthGuard —which is global— needs SupabaseAuthService
 * to verify the signature and UsersRepository to read role and status, and
 * the admin module needs AuthService and PasswordService.
 *
 * It no longer imports JwtModule: this API stopped signing tokens when it
 * moved to Supabase Auth. It only verifies them, and `jose` does that against
 * the project's JWKS.
 */
@Global()
@Module({
  // The registration seeds the new account's categories (CategoriesService);
  // /auth/me lists the user's active feature flags (FlagsService).
  imports: [CategoriesModule, FlagsModule],
  controllers: [AuthV2Controller],
  providers: [
    AuthService,
    SupabaseAuthService,
    PasswordService,
    AuditService,
    AuditRepository,
    UsersRepository,
    UsersService,
  ],
  // UsersRepository is exported only for JwtAuthGuard, which AppModule
  // registers as the global guard; modules use UsersService.
  exports: [
    AuthService,
    SupabaseAuthService,
    PasswordService,
    AuditService,
    UsersService,
    UsersRepository,
  ],
})
export class AuthModule {}
