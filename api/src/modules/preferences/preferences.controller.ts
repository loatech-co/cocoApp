import { Body, Controller, Get, Patch } from '@nestjs/common';

import { UpdatePreferencesDto } from './preferences.dto';
import { PreferencesService } from './preferences.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';
import { ApiAuthenticated, ApiData, ApiErrors } from '../../contract/v1/openapi.decorators';
import { PreferencesResponse } from '../../contract/v1/preferences.response';
import { preferencesV1, type PreferencesV1 } from '../../presenters/v1/preferences.presenter';

@ApiAuthenticated()
@Controller('preferences')
export class PreferencesController {
  constructor(private readonly preferences: PreferencesService) {}

  @Get()
  @ApiData(PreferencesResponse)
  async leer(@CurrentUser() user: AuthenticatedUser): Promise<PreferencesV1> {
    return preferencesV1(await this.preferences.leer(user.id));
  }

  @Patch()
  @ApiData(PreferencesResponse)
  @ApiErrors(400)
  async actualizar(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdatePreferencesDto,
  ): Promise<PreferencesV1> {
    return preferencesV1(await this.preferences.actualizar(user.id, dto));
  }
}
