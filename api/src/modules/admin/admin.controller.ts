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
import { auditPageV1, userPageV1 } from '../../presenters/v1/admin.presenter';
import { profileV1, type ProfileV1 } from '../../presenters/v1/auth.presenter';

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
  async listar(@Query() query: ListUsersQueryDto) {
    return userPageV1(await this.admin.listarUsuarios(query));
  }

  @Post('users/:id/approve')
  @ApiData(ProfileResponse, { status: 201 })
  @ApiErrors(400, 404)
  async aprobar(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseBigIntPipe) id: bigint,
  ): Promise<ProfileV1> {
    return profileV1(await this.admin.aprobar(user.id, id, {}));
  }

  @Post('users/:id/suspend')
  @ApiData(ProfileResponse, { status: 201 })
  @ApiErrors(400, 404)
  async suspender(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseBigIntPipe) id: bigint,
  ): Promise<ProfileV1> {
    return profileV1(await this.admin.suspender(user.id, id, {}));
  }

  @Post('users/:id/reactivate')
  @ApiData(ProfileResponse, { status: 201 })
  @ApiErrors(400, 404)
  async reactivar(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseBigIntPipe) id: bigint,
  ): Promise<ProfileV1> {
    return profileV1(await this.admin.reactivar(user.id, id, {}));
  }

  @Post('users/:id/role')
  @ApiData(ProfileResponse, { status: 201 })
  @ApiErrors(400, 404, 422)
  async cambiarRol(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseBigIntPipe) id: bigint,
    @Body() dto: ChangeRoleDto,
  ): Promise<ProfileV1> {
    return profileV1(await this.admin.cambiarRol(user.id, id, dto.role, {}));
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
  async bitacora(@Query() query: { page?: string; per_page?: string }) {
    return auditPageV1(await this.admin.bitacora(query));
  }
}
