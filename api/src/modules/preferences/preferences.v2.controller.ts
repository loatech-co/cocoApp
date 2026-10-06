import { Body, Controller, Get, Patch } from '@nestjs/common';

import { UpdatePreferencesInput } from './dto/v2/preferences.dto';
import type { Preferences as PreferencesBody } from './preferences';
import { PreferencesService } from './preferences.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';
import { Preferences } from '../../contract/v2/misc.response';
import { ApiAuthenticated, ApiErrors, ApiDataV2 } from '../../contract/v2/openapi.decorators';
import { preferencesV2 } from '../../presenters/v2/preferences.presenter';

/** The person's preferences. */
@ApiAuthenticated()
@Controller({ path: 'preferences', version: '2' })
export class PreferencesV2Controller {
  constructor(private readonly preferences: PreferencesService) {}

  @Get()
  @ApiDataV2(Preferences)
  async get(@CurrentUser() user: AuthenticatedUser): Promise<PreferencesBody> {
    return preferencesV2(await this.preferences.read(user.id));
  }

  @Patch()
  @ApiDataV2(Preferences)
  @ApiErrors(400)
  async update(
    @CurrentUser() user: AuthenticatedUser,
    @Body() input: UpdatePreferencesInput,
  ): Promise<PreferencesBody> {
    return preferencesV2(await this.preferences.update(user.id, input));
  }
}
