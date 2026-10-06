import { Controller, Get, Query } from '@nestjs/common';

import type { DashboardQueryDto } from './dashboard.dto';
import { DashboardService } from './dashboard.service';
import type { Dashboard as DashboardBody } from './dashboard.types';
import { DashboardQuery } from './dto/v2/dashboard.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';
import { Dashboard } from '../../contract/v2/dashboard.response';
import { ApiAuthenticated, ApiErrors, ApiDataV2 } from '../../contract/v2/openapi.decorators';
import { defined, type V1Draft } from '../../contract/v2/v1-input';
import { dashboardV2 } from '../../presenters/v2/dashboard.presenter';

/** v2 of the summary: the same service, its own presenter. */
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
    const v1 = defined<V1Draft<DashboardQueryDto>>({
      from: query.from,
      to: query.to,
      category_id: query.categoryId,
      category_ids: query.categoryIds,
      q: query.q,
    });
    return dashboardV2(await this.dashboard.resumen(user.id, v1));
  }
}
