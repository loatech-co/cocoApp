import { Global, Module } from '@nestjs/common';

import { Database } from './database';
import { PrismaService } from './prisma.service';

/**
 * Global so `Database` (or, in the exceptions listed in
 * `database.rule.spec.ts`, PrismaService) can be injected into any repository
 * without importing it module by module.
 */
@Global()
@Module({
  providers: [PrismaService, Database],
  exports: [PrismaService, Database],
})
export class PrismaModule {}
