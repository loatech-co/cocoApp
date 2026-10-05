import { Body, Controller, Get, Patch } from '@nestjs/common';

import type { Preferencias } from './preferences';
import { UpdatePreferencesDto } from './preferences.dto';
import { PreferencesService } from './preferences.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';

@Controller('preferences')
export class PreferencesController {
  constructor(private readonly preferences: PreferencesService) {}

  @Get()
  leer(@CurrentUser() user: AuthenticatedUser): Promise<Preferencias> {
    return this.preferences.leer(user.id);
  }

  @Patch()
  actualizar(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdatePreferencesDto,
  ): Promise<Preferencias> {
    return this.preferences.actualizar(user.id, dto);
  }
}
