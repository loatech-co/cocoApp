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
 * mantiene bajo (5–10): MariaDB compartida en Hostinger tiene un
 * `max_user_connections` modesto y agotarlo tumba la app.
 *
 * Ningún service ni controller instancia PrismaClient por su cuenta.
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  async onModuleInit(): Promise<void> {
    await this.$connect();
    this.logger.log('Conectado a la base de datos');
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
    this.logger.log('Desconectado de la base de datos');
  }

  /**
   * Ping para el healthcheck: confirma que el proceso puede hablar con MariaDB.
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
