import { Controller, Get, Query } from '@nestjs/common';

import { DashboardService } from './dashboard.service';
import type { Dashboard as DashboardBody } from './dashboard.types';
import { DashboardQuery } from './dto/v2/dashboard.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';
import { Dashboard } from '../../contract/v2/dashboard.response';
import { ApiAuthenticated, ApiErrors, ApiDataV2 } from '../../contract/v2/openapi.decorators';
import { dashboardV2 } from '../../presenters/v2/dashboard.presenter';

/** The summary of a range: what came in, what went out, and where. */
@ApiAuthenticated()
@Controller({ path: 'dashboard', version: '2' })
export class DashboardV2Controller {
  constructor(private readonly dashboard: DashboardService) {}

  @Get()
  @ApiDataV2(Dashboard)
  @ApiErrors(400)
  async get(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: DashboardQuery,
  ): Promise<DashboardBody> {
    return dashboardV2(await this.dashboard.summary(user.id, query));
  }
}
