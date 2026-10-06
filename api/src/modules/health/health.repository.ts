import { Injectable, Logger } from '@nestjs/common';

import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class HealthRepository {
  private readonly logger = new Logger(HealthRepository.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Ping for the health check: confirms the process can talk to the database.
   * It tells "the API is alive" from "the API is alive AND sees the database".
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
