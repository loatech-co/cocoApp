import { Logger } from '@nestjs/common';

/**
 * Deja rastro legible de un fallo que no se puede atrapar, y se va.
 *
 * El caso real es el motor de Prisma: cuando entra en pánico —por ejemplo con
 * `PANIC: timer has gone away` tras un rato sin tráfico— la excepción nace
 * dentro de Rust, no hay `try` que la contenga, y lo que queda en el log es un
 * volcado de mil líneas de la biblioteca compilada. Una línea propia antes de
 * salir convierte diez minutos de arqueología en un `grep`.
 *
 * Y se SALE, no se intenta seguir: un proceso cuyo motor de base de datos acaba
 * de morir no puede atender nada útil, y quedarse vivo solo produce un sitio que
 * responde 500 a todo en vez de dejar que la plataforma levante uno sano.
 */
export function installSafetyNet(
  proceso: Pick<NodeJS.Process, 'on' | 'exit'> = process,
  logger: Pick<Logger, 'error'> = new Logger('Bootstrap'),
): void {
  proceso.on('uncaughtException', (error: Error) => {
    const esPanicoDePrisma = /PANIC|timer has gone away/i.test(error.message);
    logger.error(
      esPanicoDePrisma
        ? `El motor de Prisma entró en pánico (${error.message}). El proceso se reinicia.`
        : `Excepción no atrapada: ${error.message}`,
      error.stack,
    );
    // Salida 0 y no 1: LiteSpeed trata un código distinto de cero como fallo de
    // arranque y aplica una espera antes de reintentar, que es lo que convertía
    // un pánico puntual en un 503 pegado durante minutos. Con 0 respawnea en la
    // siguiente petición.
    proceso.exit(0);
  });

  proceso.on('unhandledRejection', (razon: unknown) => {
    logger.error(
      `Promesa rechazada sin manejar: ${razon instanceof Error ? razon.message : String(razon)}`,
      razon instanceof Error ? razon.stack : undefined,
    );
    // El mismo 0 que arriba, y por lo mismo: una promesa rechazada en marcha
    // es un fallo puntual, no un arranque roto. Con 1, LiteSpeed esperaba
    // antes de levantar otro proceso y el sitio quedaba en 503 durante minutos.
    proceso.exit(0);
  });
}
