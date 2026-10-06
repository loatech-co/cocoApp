import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OpenFeature } from '@openfeature/server-sdk';

import { type FlagName, parseFeatures } from '@coco/flags';

import { CocoFlagProvider } from './coco-flag-provider';
import { FLAG_CLIENT, FlagsService } from './flags.service';
import { leerDelEntorno } from '../../common/env';
import { PreferencesService } from '../preferences/preferences.service';

/** The flags `FEATURES` turns on for everyone. */
const SERVER_FLAGS = Symbol('SERVER_FLAGS');

/**
 * OpenFeature's server SDK registered as a Nest provider (D25: not
 * `@openfeature/nestjs-sdk`, which has no stable release).
 *
 * The provider is set on its own domain rather than as OpenFeature's global
 * default, so nothing else in the process can replace it by accident.
 * `FEATURES` was already validated at boot (`common/config/env.ts`); unknown
 * names never reach here.
 */
const FLAGS_DOMAIN = 'coco';

@Module({
  providers: [
    {
      provide: SERVER_FLAGS,
      inject: [ConfigService],
      useFactory: (config: ConfigService): ReadonlySet<FlagName> =>
        new Set(
          parseFeatures(leerDelEntorno('FEATURES', { FEATURES: config.get<string>('FEATURES') }))
            .names,
        ),
    },
    {
      provide: FLAG_CLIENT,
      inject: [SERVER_FLAGS, PreferencesService],
      useFactory: async (serverFlags: ReadonlySet<FlagName>, preferences: PreferencesService) => {
        const provider = new CocoFlagProvider(serverFlags, (userId) =>
          preferences.featureOverrides(userId),
        );
        await OpenFeature.setProviderAndWait(FLAGS_DOMAIN, provider);
        return OpenFeature.getClient(FLAGS_DOMAIN);
      },
    },
    FlagsService,
  ],
  exports: [FlagsService],
})
export class FlagsModule {}
