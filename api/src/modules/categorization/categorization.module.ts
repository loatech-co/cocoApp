import { Global, Module } from '@nestjs/common';

import { CategorizationController } from './categorization.controller';
import { CategorizationRepository } from './categorization.repository';
import { CategorizationService } from './categorization.service';

/**
 * Global porque el módulo de importación necesita el servicio, y en el futuro
 * también lo necesitará el de conceptos fijos.
 */
@Global()
@Module({
  controllers: [CategorizationController],
  providers: [CategorizationService, CategorizationRepository],
  exports: [CategorizationService],
})
export class CategorizationModule {}
