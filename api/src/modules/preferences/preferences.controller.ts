import { Body, Controller, Get, Patch } from '@nestjs/common';

import type { Preferencias } from './preferences';
import { UpdatePreferencesDto } from './preferences.dto';
import { PreferencesService } from './preferences.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';
import { ApiAuthenticated, ApiData, ApiErrors } from '../../contract/v1/openapi.decorators';
import { PreferencesResponse } from '../../contract/v1/preferences.response';

@ApiAuthenticated()
@Controller('preferences')
export class PreferencesController {
  constructor(private readonly preferences: PreferencesService) {}

  @Get()
  @ApiData(PreferencesResponse)
  leer(@CurrentUser() user: AuthenticatedUser): Promise<Preferencias> {
    return this.preferences.leer(user.id);
  }

  @Patch()
  @ApiData(PreferencesResponse)
  @ApiErrors(400)
  actualizar(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdatePreferencesDto,
  ): Promise<Preferencias> {
    return this.preferences.actualizar(user.id, dto);
  }
}
