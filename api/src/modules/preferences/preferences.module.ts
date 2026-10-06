import { Global, Module } from '@nestjs/common';

import { PreferencesRepository } from './preferences.repository';
import { PreferencesService } from './preferences.service';
import { PreferencesV2Controller } from './preferences.v2.controller';

/** Global: several modules ask it whether accounts are switched on. */
@Global()
@Module({
  controllers: [PreferencesV2Controller],
  providers: [PreferencesService, PreferencesRepository],
  exports: [PreferencesService],
})
export class PreferencesModule {}
