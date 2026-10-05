import { Global, Module } from '@nestjs/common';

import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { PasswordService } from './password.service';
import { SupabaseAuthService } from './supabase-auth.service';
import { UsersRepository } from './users.repository';
import { AuditRepository } from '../../common/audit/audit.repository';
import { AuditService } from '../../common/audit/audit.service';
import { CategoriesModule } from '../categories/categories.module';

/**
 * Global porque el JwtAuthGuard —que es global— necesita SupabaseAuthService
 * para verificar la firma y UsersRepository para leer rol y estado, y el módulo de administración necesita AuthService
 * y PasswordService.
 *
 * Ya no importa JwtModule: esta API dejó de firmar tokens al migrar a Supabase
 * Auth. Solo los verifica, y eso lo hace `jose` contra el JWKS del proyecto.
 */
@Global()
@Module({
  // The registration seeds the new account's categories (CategoriesRepository).
  imports: [CategoriesModule],
  controllers: [AuthController],
  providers: [
    AuthService,
    SupabaseAuthService,
    PasswordService,
    AuditService,
    AuditRepository,
    UsersRepository,
  ],
  exports: [
    AuthService,
    SupabaseAuthService,
    PasswordService,
    AuditService,
    AuditRepository,
    UsersRepository,
  ],
})
export class AuthModule {}
