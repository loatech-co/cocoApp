import { Controller, Get, Query } from '@nestjs/common';

import type { DashboardQueryDto } from './dashboard.dto';
import { DashboardService } from './dashboard.service';
import type { DashboardPayload } from './dashboard.types';
import { DashboardQuery } from './dto/v2/dashboard.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';
import { ApiAuthenticated, ApiErrors } from '../../contract/v1/openapi.decorators';
import { Dashboard } from '../../contract/v2/dashboard.response';
import { ApiDataV2 } from '../../contract/v2/openapi.decorators';
import { defined, toV2, type ToV2, type V1Draft } from '../../contract/v2/to-v2';

/** v2 of the summary: the same service, translated at the edge. */
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
  ): Promise<ToV2<DashboardPayload>> {
    const v1 = defined<V1Draft<DashboardQueryDto>>({
      from: query.from,
      to: query.to,
      category_id: query.categoryId,
      category_ids: query.categoryIds,
      q: query.q,
    });
    return toV2(await this.dashboard.resumen(user.id, v1));
  }
}
