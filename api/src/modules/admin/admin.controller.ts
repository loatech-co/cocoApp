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
import { ApiQuery } from '@nestjs/swagger';

import { ChangeRoleDto, ListUsersQueryDto, ResetPasswordDto } from './admin.dto';
import { AdminService } from './admin.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles, RolesGuard } from '../../common/guards/roles.guard';
import { ParseBigIntPipe } from '../../common/pipes/parse-bigint.pipe';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';
import { AuditEntryResponse } from '../../contract/v1/admin.response';
import { ProfileResponse } from '../../contract/v1/auth.response';
import {
  ApiAuthenticated,
  ApiData,
  ApiErrors,
  ApiNoContent,
} from '../../contract/v1/openapi.decorators';
import type { PerfilPublico } from '../auth/auth.service';

/**
 * Panel de administración.
 *
 * `@Roles('admin')` a nivel de clase: todas las rutas quedan restringidas de
 * una, sin depender de que alguien se acuerde de anotarlas una por una.
 */
@ApiAuthenticated()
@ApiErrors(403)
@Controller('admin')
@UseGuards(RolesGuard)
@Roles('admin')
export class AdminController {
  constructor(private readonly admin: AdminService) {}

  @Get('users')
  @ApiData(ProfileResponse, { isArray: true, meta: 'page' })
  @ApiErrors(400)
  listar(@Query() query: ListUsersQueryDto) {
    return this.admin.listarUsuarios(query);
  }

  @Post('users/:id/approve')
  @ApiData(ProfileResponse, { status: 201 })
  @ApiErrors(400, 404)
  aprobar(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseBigIntPipe) id: bigint,
  ): Promise<PerfilPublico> {
    return this.admin.aprobar(user.id, id, {});
  }

  @Post('users/:id/suspend')
  @ApiData(ProfileResponse, { status: 201 })
  @ApiErrors(400, 404)
  suspender(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseBigIntPipe) id: bigint,
  ): Promise<PerfilPublico> {
    return this.admin.suspender(user.id, id, {});
  }

  @Post('users/:id/reactivate')
  @ApiData(ProfileResponse, { status: 201 })
  @ApiErrors(400, 404)
  reactivar(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseBigIntPipe) id: bigint,
  ): Promise<PerfilPublico> {
    return this.admin.reactivar(user.id, id, {});
  }

  @Post('users/:id/role')
  @ApiData(ProfileResponse, { status: 201 })
  @ApiErrors(400, 404, 422)
  cambiarRol(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseBigIntPipe) id: bigint,
    @Body() dto: ChangeRoleDto,
  ): Promise<PerfilPublico> {
    return this.admin.cambiarRol(user.id, id, dto.role, {});
  }

  @Post('users/:id/reset-password')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContent()
  @ApiErrors(400, 404, 422)
  restablecer(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseBigIntPipe) id: bigint,
    @Body() dto: ResetPasswordDto,
  ): Promise<void> {
    return this.admin.restablecerContrasena(user.id, id, dto.newPassword, {});
  }

  @Get('audit-log')
  @ApiQuery({ name: 'page', required: false, type: Number, description: '1-based; 1 by default.' })
  @ApiQuery({ name: 'per_page', required: false, type: Number, description: '50 by default.' })
  @ApiData(AuditEntryResponse, { isArray: true, meta: 'page' })
  bitacora(@Query() query: { page?: string; per_page?: string }) {
    return this.admin.bitacora(query);
  }
}
