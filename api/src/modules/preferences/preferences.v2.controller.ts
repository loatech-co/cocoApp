import { Body, Controller, Get, Patch } from '@nestjs/common';

import { UpdatePreferencesInput } from './dto/v2/preferences.dto';
import type { Preferences as PreferencesBody } from './preferences';
import { PreferencesService } from './preferences.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';
import { ApiAuthenticated, ApiErrors } from '../../contract/v1/openapi.decorators';
import { Preferences } from '../../contract/v2/misc.response';
import { ApiDataV2 } from '../../contract/v2/openapi.decorators';
import { defined } from '../../contract/v2/v1-input';
import { preferencesV2 } from '../../presenters/v2/preferences.presenter';

/** v2 of the preferences: the same service, translated at the edge. */
@ApiAuthenticated()
@Controller({ path: 'preferences', version: '2' })
export class PreferencesV2Controller {
  constructor(private readonly preferences: PreferencesService) {}

  @Get()
  @ApiDataV2(Preferences)
  async get(@CurrentUser() user: AuthenticatedUser): Promise<PreferencesBody> {
    return preferencesV2(await this.preferences.leer(user.id));
  }

  @Patch()
  @ApiDataV2(Preferences)
  @ApiErrors(400)
  async update(
    @CurrentUser() user: AuthenticatedUser,
    @Body() input: UpdatePreferencesInput,
  ): Promise<PreferencesBody> {
    const changes = defined({ cuentas_habilitadas: input.accountsEnabled });
    return preferencesV2(await this.preferences.actualizar(user.id, changes));
  }
}
