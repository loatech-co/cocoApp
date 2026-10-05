import { Global, Module } from '@nestjs/common';

import { CategorizationController } from './categorization.controller';
import { CategorizationRepository } from './categorization.repository';
import { CategorizationService } from './categorization.service';
import { CategorizationV2Controller } from './categorization.v2.controller';
import { CategoriesModule } from '../categories/categories.module';
import { TransactionsModule } from '../transactions/transactions.module';

/**
 * Global porque el módulo de importación necesita el servicio, y en el futuro
 * también lo necesitará el de conceptos fijos.
 */
@Global()
@Module({
  imports: [TransactionsModule, CategoriesModule],
  controllers: [CategorizationController, CategorizationV2Controller],
  providers: [CategorizationService, CategorizationRepository],
  exports: [CategorizationService],
})
export class CategorizationModule {}
