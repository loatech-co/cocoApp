import { Controller, Get, Query } from '@nestjs/common';

import { DashboardQueryDto } from './dashboard.dto';
import { DashboardService } from './dashboard.service';
import type { DashboardPayload } from './dashboard.types';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';
import { DashboardResponse } from '../../contract/v1/dashboard.response';
import { ApiAuthenticated, ApiData, ApiErrors } from '../../contract/v1/openapi.decorators';

/** M5 — Dashboard. Todo derivado; ninguna cifra se almacena. */
@ApiAuthenticated()
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  @Get()
  @ApiData(DashboardResponse)
  @ApiErrors(400)
  resumen(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: DashboardQueryDto,
  ): Promise<DashboardPayload> {
    return this.dashboard.resumen(user.id, query);
  }
}
