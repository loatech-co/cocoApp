import { Global, Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';

import { AuditService } from '../../common/audit/audit.service';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { PasswordService } from './password.service';
import { TokenService } from './token.service';

/**
 * Global porque el JwtAuthGuard —que es global— necesita TokenService, y el
 * módulo de administración necesita PasswordService y TokenService.
 */
@Global()
@Module({
  imports: [JwtModule.register({})],
  controllers: [AuthController],
  providers: [AuthService, PasswordService, TokenService, AuditService],
  exports: [AuthService, PasswordService, TokenService, AuditService],
})
export class AuthModule {}
