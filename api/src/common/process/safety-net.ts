import { Logger } from '@nestjs/common';

/**
 * Leaves a readable trace of a failure that cannot be caught, and leaves.
 *
 * The real case was Prisma's engine: when it panicked —for instance with
 * `PANIC: timer has gone away` after a while without traffic— the exception
 * was born inside Rust, no `try` could hold it, and what was left in the log
 * was a thousand-line dump of the compiled library. One line of our own
 * before exiting turns ten minutes of archaeology into a `grep`.
 *
 * And it EXITS, it does not try to carry on: a process whose database engine
 * just died cannot serve anything useful, and staying alive only produces a
 * site that answers 500 to everything instead of letting the platform start a
 * healthy one.
 */
export function installSafetyNet(
  proc: Pick<NodeJS.Process, 'on' | 'exit'> = process,
  logger: Pick<Logger, 'error'> = new Logger('Bootstrap'),
): void {
  proc.on('uncaughtException', (error: Error) => {
    const isPrismaPanic = /PANIC|timer has gone away/i.test(error.message);
    logger.error(
      isPrismaPanic
        ? `The Prisma engine panicked (${error.message}). The process restarts.`
        : `Uncaught exception: ${error.message}`,
      error.stack,
    );
    // Exit 0 and not 1: LiteSpeed treats a non-zero code as a startup failure
    // and waits before retrying, which is what turned a one-off panic into a
    // 503 stuck for minutes. With 0 it respawns on the next request.
    proc.exit(0);
  });

  proc.on('unhandledRejection', (reason: unknown) => {
    logger.error(
      `Unhandled promise rejection: ${reason instanceof Error ? reason.message : String(reason)}`,
      reason instanceof Error ? reason.stack : undefined,
    );
    // The same 0 as above, for the same reason: a promise rejected while
    // running is a one-off failure, not a broken startup. With 1, LiteSpeed
    // waited before starting another process and the site stayed on 503 for
    // minutes.
    proc.exit(0);
  });
}
