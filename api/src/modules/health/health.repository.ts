import { Injectable, Logger } from '@nestjs/common';

import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class HealthRepository {
  private readonly logger = new Logger(HealthRepository.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Ping para el healthcheck: confirma que el proceso puede hablar con la base.
   * Distingue "la API está viva" de "la API está viva Y ve la base".
   */
  async isDatabaseReachable(): Promise<boolean> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return true;
    } catch (error) {
      this.logger.error(
        'La base de datos no responde',
        error instanceof Error ? error.stack : String(error),
      );
      return false;
    }
  }
}
