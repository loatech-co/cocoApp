import { Global, Module } from '@nestjs/common';

import { PreferencesController } from './preferences.controller';
import { PreferencesRepository } from './preferences.repository';
import { PreferencesService } from './preferences.service';
import { PreferencesV2Controller } from './preferences.v2.controller';

/** Global: lo consultan varios módulos para saber si las cuentas están activas. */
@Global()
@Module({
  controllers: [PreferencesController, PreferencesV2Controller],
  providers: [PreferencesService, PreferencesRepository],
  exports: [PreferencesService],
})
export class PreferencesModule {}
