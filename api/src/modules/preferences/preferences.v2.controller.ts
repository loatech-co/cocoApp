import { Body, Controller, Get, Patch } from '@nestjs/common';

import { UpdatePreferencesInput } from './dto/v2/preferences.dto';
import type { Preferencias } from './preferences';
import { PreferencesService } from './preferences.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';
import { ApiAuthenticated, ApiErrors } from '../../contract/v1/openapi.decorators';
import { Preferences } from '../../contract/v2/misc.response';
import { ApiDataV2 } from '../../contract/v2/openapi.decorators';
import { defined, toV2, type ToV2 } from '../../contract/v2/to-v2';

/** v2 of the preferences: the same service, translated at the edge. */
@ApiAuthenticated()
@Controller({ path: 'preferences', version: '2' })
export class PreferencesV2Controller {
  constructor(private readonly preferences: PreferencesService) {}

  @Get()
  @ApiDataV2(Preferences)
  async get(@CurrentUser() user: AuthenticatedUser): Promise<ToV2<Preferencias>> {
    return toV2(await this.preferences.leer(user.id));
  }

  @Patch()
  @ApiDataV2(Preferences)
  @ApiErrors(400)
  async update(
    @CurrentUser() user: AuthenticatedUser,
    @Body() input: UpdatePreferencesInput,
  ): Promise<ToV2<Preferencias>> {
    const changes = defined({ cuentas_habilitadas: input.accountsEnabled });
    return toV2(await this.preferences.actualizar(user.id, changes));
  }
}
