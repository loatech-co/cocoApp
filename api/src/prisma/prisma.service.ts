import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';

/**
 * Único punto de acceso a la base de datos.
 *
 * Es un singleton dentro del proceso Node persistente, así que el pool de
 * conexiones queda VIVO entre peticiones — esa es justamente la ventaja del
 * proceso de larga vida frente al modelo "un intérprete por request".
 *
 * El tamaño del pool se controla con `connection_limit` en la DATABASE_URL y se
 * mantiene bajo (5–10): se sale por el pooler de Supabase, y abrir más
 * conexiones de las que el plan permite las hace fallar sin aviso.
 *
 * Ningún service ni controller instancia PrismaClient por su cuenta, y desde
 * el paso 7.4 tampoco lo inyectan: solo los repositorios (`*.repository.ts`)
 * hablan con la base.
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    // El adaptador `pg` reemplaza al motor Rust de Prisma. Ver la nota del
    // generador en schema.prisma: el motor entraba en pánico al suspenderse el
    // proceso y tumbaba el sitio.
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
