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

import { AdminService, type AuditPage, type UserPage } from './admin.service';
import { ChangeRoleDto, ListUsersQuery, ResetPasswordDto } from './dto/v2/admin.dto';
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
import { auditPageV2, userPageV2 } from '../../presenters/v2/admin.presenter';
import { profileV2 } from '../../presenters/v2/auth.presenter';
import type { Profile as ProfileBody } from '../auth/auth.service';

/**
 * The administration: users waiting for approval, roles, and the audit log.
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
    return userPageV2(await this.admin.listUsers(query));
  }

  @Post('users/:id/approve')
  @ApiDataV2(Profile, { status: 201 })
  @ApiErrors(400, 404)
  async approve(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseBigIntPipe) id: bigint,
  ): Promise<ProfileBody> {
    return profileV2(await this.admin.approve(user.id, id, {}));
  }

  @Post('users/:id/suspend')
  @ApiDataV2(Profile, { status: 201 })
  @ApiErrors(400, 404)
  async suspend(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseBigIntPipe) id: bigint,
  ): Promise<ProfileBody> {
    return profileV2(await this.admin.suspend(user.id, id, {}));
  }

  @Post('users/:id/reactivate')
  @ApiDataV2(Profile, { status: 201 })
  @ApiErrors(400, 404)
  async reactivate(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseBigIntPipe) id: bigint,
  ): Promise<ProfileBody> {
    return profileV2(await this.admin.reactivate(user.id, id, {}));
  }

  @Post('users/:id/role')
  @ApiDataV2(Profile, { status: 201 })
  @ApiErrors(400, 404, 422)
  async changeRole(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseBigIntPipe) id: bigint,
    @Body() input: ChangeRoleDto,
  ): Promise<ProfileBody> {
    return profileV2(await this.admin.changeRole(user.id, id, input.role, {}));
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
    return this.admin.resetPassword(user.id, id, input.newPassword, {});
  }

  @Get('audit-log')
  @ApiDataV2(AuditEntry, { isPage: true })
  @ApiErrors(400)
  async auditLog(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: PageQuery,
  ): Promise<AuditPage> {
    return auditPageV2(await this.admin.auditLog(user.id, query));
  }
}
