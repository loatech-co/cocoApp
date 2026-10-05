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

import { ChangeRoleDto, ResetPasswordDto } from './admin.dto';
import { AdminService, type AuditPage, type UserPage } from './admin.service';
import { ListUsersQuery } from './dto/v2/admin.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles, RolesGuard } from '../../common/guards/roles.guard';
import { ParseBigIntPipe } from '../../common/pipes/parse-bigint.pipe';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';
import { AuditEntry, Profile } from '../../contract/v2/auth.response';
import {
  ApiAuthenticated,
  ApiErrors,
  ApiNoContent,
  ApiDataV2,
} from '../../contract/v2/openapi.decorators';
import { PageQuery } from '../../contract/v2/page.dto';
import { defined } from '../../contract/v2/v1-input';
import { auditPageV2, userPageV2 } from '../../presenters/v2/admin.presenter';
import { profileV2 } from '../../presenters/v2/auth.presenter';
import type { Profile as ProfileBody } from '../auth/auth.service';

/**
 * v2 of the administration: the same service, its own presenter. The
 * bodies (`role`, `newPassword`) were English already, so they are the v1 DTOs.
 */
@ApiAuthenticated()
@ApiErrors(403)
@Controller({ path: 'admin', version: '2' })
@UseGuards(RolesGuard)
@Roles('admin')
export class AdminV2Controller {
  constructor(private readonly admin: AdminService) {}

  @Get('users')
  @ApiDataV2(Profile, { isPage: true })
  @ApiErrors(400)
  async listUsers(@Query() query: ListUsersQuery): Promise<UserPage> {
    return userPageV2(
      await this.admin.listarUsuarios(
        defined({ status: query.status, page: query.page, per_page: query.perPage }),
      ),
    );
  }

  @Post('users/:id/approve')
  @ApiDataV2(Profile, { status: 201 })
  @ApiErrors(400, 404)
  async approve(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseBigIntPipe) id: bigint,
  ): Promise<ProfileBody> {
    return profileV2(await this.admin.aprobar(user.id, id, {}));
  }

  @Post('users/:id/suspend')
  @ApiDataV2(Profile, { status: 201 })
  @ApiErrors(400, 404)
  async suspend(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseBigIntPipe) id: bigint,
  ): Promise<ProfileBody> {
    return profileV2(await this.admin.suspender(user.id, id, {}));
  }

  @Post('users/:id/reactivate')
  @ApiDataV2(Profile, { status: 201 })
  @ApiErrors(400, 404)
  async reactivate(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseBigIntPipe) id: bigint,
  ): Promise<ProfileBody> {
    return profileV2(await this.admin.reactivar(user.id, id, {}));
  }

  @Post('users/:id/role')
  @ApiDataV2(Profile, { status: 201 })
  @ApiErrors(400, 404, 422)
  async changeRole(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseBigIntPipe) id: bigint,
    @Body() input: ChangeRoleDto,
  ): Promise<ProfileBody> {
    return profileV2(await this.admin.cambiarRol(user.id, id, input.role, {}));
  }

  @Post('users/:id/reset-password')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContent()
  @ApiErrors(400, 404, 422)
  resetPassword(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseBigIntPipe) id: bigint,
    @Body() input: ResetPasswordDto,
  ): Promise<void> {
    return this.admin.restablecerContrasena(user.id, id, input.newPassword, {});
  }

  @Get('audit-log')
  @ApiDataV2(AuditEntry, { isPage: true })
  @ApiErrors(400)
  async auditLog(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: PageQuery,
  ): Promise<AuditPage> {
    return auditPageV2(
      await this.admin.bitacora(
        user.id,
        defined({
          page: query.page === undefined ? undefined : String(query.page),
          per_page: query.perPage === undefined ? undefined : String(query.perPage),
        }),
      ),
    );
  }
}
