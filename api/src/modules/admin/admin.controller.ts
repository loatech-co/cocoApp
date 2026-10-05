import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';

import { ChangeRoleDto, ListUsersQueryDto, ResetPasswordDto } from './admin.dto';
import { AdminService } from './admin.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles, RolesGuard } from '../../common/guards/roles.guard';
import { ParseBigIntPipe } from '../../common/pipes/parse-bigint.pipe';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';
import type { PerfilPublico } from '../auth/auth.service';

/**
 * Panel de administración.
 *
 * `@Roles('admin')` a nivel de clase: todas las rutas quedan restringidas de
 * una, sin depender de que alguien se acuerde de anotarlas una por una.
 */
@Controller('admin')
@UseGuards(RolesGuard)
@Roles('admin')
export class AdminController {
  constructor(private readonly admin: AdminService) {}

  @Get('users')
  listar(@Query() query: ListUsersQueryDto) {
    return this.admin.listarUsuarios(query);
  }

  @Post('users/:id/approve')
  aprobar(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseBigIntPipe) id: bigint,
  ): Promise<PerfilPublico> {
    return this.admin.aprobar(user.id, id, {});
  }

  @Post('users/:id/suspend')
  suspender(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseBigIntPipe) id: bigint,
  ): Promise<PerfilPublico> {
    return this.admin.suspender(user.id, id, {});
  }

  @Post('users/:id/reactivate')
  reactivar(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseBigIntPipe) id: bigint,
  ): Promise<PerfilPublico> {
    return this.admin.reactivar(user.id, id, {});
  }

  @Post('users/:id/role')
  cambiarRol(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseBigIntPipe) id: bigint,
    @Body() dto: ChangeRoleDto,
  ): Promise<PerfilPublico> {
    return this.admin.cambiarRol(user.id, id, dto.role, {});
  }

  @Post('users/:id/reset-password')
  @HttpCode(HttpStatus.NO_CONTENT)
  restablecer(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseBigIntPipe) id: bigint,
    @Body() dto: ResetPasswordDto,
  ): Promise<void> {
    return this.admin.restablecerContrasena(user.id, id, dto.newPassword, {});
  }

  @Get('audit-log')
  bitacora(@Query() query: { page?: string; per_page?: string }) {
    return this.admin.bitacora(query);
  }
}
