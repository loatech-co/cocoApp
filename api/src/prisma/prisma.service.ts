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
/**
 * Cada cuánto se toca la base para que el motor no quede inactivo.
 *
 * Cuatro minutos es por debajo de cualquier umbral de inactividad razonable, y
 * el costo es una consulta trivial cada 240 segundos: irrelevante incluso en el
 * plan gratuito.
 */
const LATIDO_MS = 4 * 60 * 1000;

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);
  private latido: NodeJS.Timeout | null = null;

  async onModuleInit(): Promise<void> {
    await this.$connect();
    this.logger.log('Conectado a la base de datos');
    this.arrancarLatido();
  }

  async onModuleDestroy(): Promise<void> {
    if (this.latido) clearInterval(this.latido);
    await this.$disconnect();
    this.logger.log('Desconectado de la base de datos');
  }

  /**
   * Mantiene el motor de Prisma despierto.
   *
   * ── El fallo que esto evita ─────────────────────────────────────────────────
   * Tras un rato sin tráfico, el motor Rust de Prisma entraba en pánico con
   * `PANIC: timer has gone away`: su hilo de temporizadores desaparece mientras
   * queda una espera pendiente. La excepción no se puede atrapar desde
   * JavaScript —nace dentro del motor— y tumbaba el proceso entero, dejando el
   * sitio en 503 hasta un reinicio a mano.
   *
   * Una consulta periódica evita esa ventana de inactividad. No es elegante:
   * lo elegante sería que el motor no entrara en pánico. Pero 6.19.3 es la
   * última versión de la serie 6 y el arreglo está en un major que todavía es
   * release candidate, así que esto es lo que hay hasta entonces.
   *
   * `unref()` es importante: sin él, este temporizador mantendría el proceso
   * vivo y ni `npm test` ni un apagado ordenado terminarían nunca.
   */
  private arrancarLatido(): void {
    this.latido = setInterval(() => {
      void this.$queryRaw`SELECT 1`.catch((error: unknown) => {
        this.logger.warn(
          `El latido a la base falló: ${error instanceof Error ? error.message : String(error)}`,
        );
      });
    }, LATIDO_MS);

    this.latido.unref();
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
