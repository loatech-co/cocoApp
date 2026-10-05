import { Global, Module } from '@nestjs/common';

import { Database } from './database';
import { PrismaService } from './prisma.service';

/**
 * Global para poder inyectar `Database` (o, en las excepciones listadas en
 * `database.rule.spec.ts`, PrismaService) en cualquier repository sin
 * reimportarlo módulo por módulo.
 */
@Global()
@Module({
  providers: [PrismaService, Database],
  exports: [PrismaService, Database],
})
export class PrismaModule {}
