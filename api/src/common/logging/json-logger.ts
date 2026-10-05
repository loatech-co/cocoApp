import type { LoggerService, LogLevel } from '@nestjs/common';
import {
  closeSync,
  existsSync,
  fstatSync,
  mkdirSync,
  openSync,
  renameSync,
  statSync,
  writeSync,
} from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

import { currentRequestId } from './request-context';

/**
 * Structured logs: one JSON object per line, with the request id of the
 * request that produced it (phase 6.8).
 *
 * ── Where they go ───────────────────────────────────────────────────────────
 * Always to stdout/stderr, as before. And, when a log directory is set, also
 * to `<dir>/api.log`, rotated by size. In production the default directory is
 * `~/logs/coco-api`, OUTSIDE the deployed release: hbuilds replaces the whole
 * release folder on every deploy, and the `stderr.log` that lives there is
 * lost with it.
 *
 * ── Why not pino ────────────────────────────────────────────────────────────
 * Its file transports run in worker threads, and on this host every thread
 * counts against the account's process cap (CloudLinux LVE `nproc`), which
 * the app already lives next to — a stray process has locked SSH out before.
 * A size-rotated append in the same thread needs no dependency and no extra
 * thread. The writes are synchronous on purpose: an async stream opens its
 * file later, so a burst could rotate a file that did not exist yet and keep
 * writing to the old name. At a few thousand lines a day the cost is nil.
 *
 * ── What never goes in ──────────────────────────────────────────────────────
 * Amounts, descriptions, receipt text, emails, tokens. Callers log ids and
 * outcomes; the access line drops the query string.
 */

const LEVELS: LogLevel[] = ['verbose', 'debug', 'log', 'warn', 'error', 'fatal'];

export interface JsonLoggerOptions {
  /** Directory for `api.log`; undefined logs to stdout only. */
  directory?: string | undefined;
  /** Rotate when the file passes this size. */
  maxBytes?: number;
  /** Rotated files kept: `api.log.1` … `api.log.N`. */
  keep?: number;
  /** Lowest level written. */
  minLevel?: LogLevel;
}

/** `LOG_LEVEL` if it names a Nest level; `log` otherwise. */
export function parseLogLevel(value: string | undefined): LogLevel {
  return LEVELS.find((level) => level === value) ?? 'log';
}

/** Production default: outside the release folder, which every deploy replaces. */
export function defaultLogDirectory(env: NodeJS.ProcessEnv): string | undefined {
  if (env.LOG_DIR) return env.LOG_DIR;
  return env.NODE_ENV === 'production' ? join(homedir(), 'logs', 'coco-api') : undefined;
}

export class JsonLogger implements LoggerService {
  private fd: number | null = null;
  private readonly file: string | null;
  private readonly maxBytes: number;
  private readonly keep: number;
  private readonly minLevel: number;

  constructor(options: JsonLoggerOptions = {}) {
    this.maxBytes = options.maxBytes ?? 5 * 1024 * 1024;
    this.keep = options.keep ?? 5;
    this.minLevel = LEVELS.indexOf(options.minLevel ?? 'log');
    this.file = options.directory ? join(options.directory, 'api.log') : null;

    if (options.directory && this.file) {
      mkdirSync(options.directory, { recursive: true, mode: 0o700 });
      this.fd = this.open(this.file);
    }
  }

  log(message: unknown, ...rest: unknown[]): void {
    this.write('log', message, rest);
  }
  error(message: unknown, ...rest: unknown[]): void {
    this.write('error', message, rest);
  }
  warn(message: unknown, ...rest: unknown[]): void {
    this.write('warn', message, rest);
  }
  debug(message: unknown, ...rest: unknown[]): void {
    this.write('debug', message, rest);
  }
  verbose(message: unknown, ...rest: unknown[]): void {
    this.write('verbose', message, rest);
  }
  fatal(message: unknown, ...rest: unknown[]): void {
    this.write('fatal', message, rest);
  }

  /** An already-structured entry (the access line). */
  entry(fields: Record<string, unknown>, level: LogLevel = 'log'): void {
    this.emit(level, fields);
  }

  /**
   * Nest calls `logger.error(message, stack, context)` and
   * `logger.log(message, context)`: the LAST string argument is the context,
   * and for errors a string before it is the stack.
   */
  private write(level: LogLevel, message: unknown, rest: unknown[]): void {
    const strings = rest.filter((value): value is string => typeof value === 'string');
    const context = strings.length > 0 ? strings[strings.length - 1] : undefined;
    const stack =
      level === 'error' || level === 'fatal'
        ? strings.length > 1
          ? strings[0]
          : undefined
        : undefined;

    this.emit(level, {
      context,
      msg:
        message instanceof Error
          ? message.message
          : typeof message === 'string'
            ? message
            : JSON.stringify(message),
      stack: message instanceof Error ? message.stack : stack,
    });
  }

  private emit(level: LogLevel, fields: Record<string, unknown>): void {
    if (LEVELS.indexOf(level) < this.minLevel) return;

    const line =
      JSON.stringify({
        time: new Date().toISOString(),
        level,
        requestId: currentRequestId(),
        ...fields,
      }) + '\n';

    (level === 'error' || level === 'fatal' || level === 'warn'
      ? process.stderr
      : process.stdout
    ).write(line);

    // `fd` only exists when `file` does; both are checked so the helpers get
    // them as plain values.
    if (this.fd !== null && this.file !== null) {
      this.followRotation(this.file, this.fd);
      writeSync(this.fd, line);
      this.rotateIfFull(this.file);
    }
  }

  /**
   * LiteSpeed runs SEVERAL processes of this app, all appending to the same
   * file. So before writing, a process checks that the name still points to
   * the file it holds open —another process may have rotated it— and reopens
   * if not; and after writing, the size that decides rotation is the file's,
   * not what this process wrote.
   */
  private followRotation(file: string, fd: number): void {
    try {
      const onDisk = existsSync(file) ? statSync(file) : null;
      if (onDisk?.ino !== fstatSync(fd).ino) {
        closeSync(fd);
        this.fd = this.open(file);
      }
    } catch {
      // Logging must never take the app down; the line still reaches stdout.
    }
  }

  private rotateIfFull(file: string): void {
    try {
      if (statSync(file).size >= this.maxBytes) this.rotate(file);
    } catch {
      // Same: a failed rotation leaves the file growing, never a crash.
    }
  }

  private open(file: string): number {
    return openSync(file, 'a', 0o600);
  }

  /** `api.log` → `api.log.1` → … → `api.log.<keep>`, the oldest dropped. */
  private rotate(file: string): void {
    if (this.fd !== null) closeSync(this.fd);
    for (let index = this.keep - 1; index >= 1; index -= 1) {
      if (existsSync(`${file}.${index}`)) renameSync(`${file}.${index}`, `${file}.${index + 1}`);
    }
    if (existsSync(file)) renameSync(file, `${file}.1`);
    this.fd = this.open(file);
  }
}
