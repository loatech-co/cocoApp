import { PrismaPg } from '@prisma/adapter-pg';
import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
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
 * Ningún service ni controller instancia PrismaClient por su cuenta.
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


  /**
   * Ping para el healthcheck: confirma que el proceso puede hablar con la base.
   * Distingue "la API está viva" de "la API está viva Y ve la base".
   */
  async isDatabaseReachable(): Promise<boolean> {
    try {
      await this.$queryRaw`SELECT 1`;
      return true;
    } catch (error) {
      this.logger.error('La base de datos no responde', error instanceof Error ? error.stack : String(error));
      return false;
    }
  }
}
