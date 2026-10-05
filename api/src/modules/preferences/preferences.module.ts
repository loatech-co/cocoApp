import { Global, Module } from '@nestjs/common';

import { PreferencesController } from './preferences.controller';
import { PreferencesRepository } from './preferences.repository';
import { PreferencesService } from './preferences.service';

/** Global: lo consultan varios módulos para saber si las cuentas están activas. */
@Global()
@Module({
  controllers: [PreferencesController],
  providers: [PreferencesService, PreferencesRepository],
  exports: [PreferencesService],
})
export class PreferencesModule {}
