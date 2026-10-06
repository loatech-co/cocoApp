import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';

import { PrismaClient } from '../generated/prisma/client';

/**
 * The single access point to the database.
 *
 * It is a singleton inside the persistent Node process, so the connection
 * pool stays ALIVE between requests — precisely the advantage of a long-lived
 * process over the "one interpreter per request" model.
 *
 * The pool size is set with `connection_limit` in the DATABASE_URL and kept
 * low (5–10): traffic goes out through Supabase's pooler, and opening more
 * connections than the plan allows makes them fail without warning.
 *
 * No service or controller creates a PrismaClient of its own, and since step
 * 7.4 they do not inject it either: only the repositories (`*.repository.ts`)
 * talk to the database.
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    // The `pg` adapter replaces Prisma's Rust engine. See the generator note
    // in schema.prisma: the engine panicked when the process was suspended and
    // took the site down.
    super({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
    this.logger.log('Conectado a la base de datos');
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
    this.logger.log('Desconectado de la base de datos');
  }
}
