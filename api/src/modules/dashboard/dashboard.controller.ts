import { Controller, Get, Query } from '@nestjs/common';

import { DashboardQueryDto } from './dashboard.dto';
import { DashboardService } from './dashboard.service';
import type { DashboardPayload } from './dashboard.types';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';

/** M5 — Dashboard. Todo derivado; ninguna cifra se almacena. */
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  @Get()
  resumen(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: DashboardQueryDto,
  ): Promise<DashboardPayload> {
    return this.dashboard.resumen(user.id, query);
  }
}
