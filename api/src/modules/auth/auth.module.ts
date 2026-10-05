import { Global, Module } from '@nestjs/common';

import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { PasswordService } from './password.service';
import { SupabaseAuthService } from './supabase-auth.service';
import { AuditService } from '../../common/audit/audit.service';

/**
 * Global porque el JwtAuthGuard —que es global— necesita SupabaseAuthService
 * para verificar la firma, y el módulo de administración necesita AuthService
 * y PasswordService.
 *
 * Ya no importa JwtModule: esta API dejó de firmar tokens al migrar a Supabase
 * Auth. Solo los verifica, y eso lo hace `jose` contra el JWKS del proyecto.
 */
@Global()
@Module({
  controllers: [AuthController],
  providers: [AuthService, SupabaseAuthService, PasswordService, AuditService],
  exports: [AuthService, SupabaseAuthService, PasswordService, AuditService],
})
export class AuthModule {}
