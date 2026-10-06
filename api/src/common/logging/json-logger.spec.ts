import type { Request, Response } from 'express';
import { EventEmitter } from 'node:events';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { defaultLogDirectory, JsonLogger, parseLogLevel } from './json-logger';
import { currentRequestId, requestContext } from './request-context';

/** Waits for the write stream to flush. */
const flush = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 30));

describe('JsonLogger', () => {
  let dir: string;
  let out: jest.SpyInstance;
  let err: jest.SpyInstance;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'coco-log-'));
    out = jest.spyOn(process.stdout, 'write').mockImplementation(() => true);
    err = jest.spyOn(process.stderr, 'write').mockImplementation(() => true);
  });

  afterEach(() => {
    out.mockRestore();
    err.mockRestore();
    rmSync(dir, { recursive: true, force: true });
  });

  const lines = (file = 'api.log'): Record<string, unknown>[] =>
    readFileSync(join(dir, file), 'utf8')
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line) as Record<string, unknown>);

  it('writes one JSON object per line, with level, context and message', async () => {
    const logger = new JsonLogger({ directory: dir });
    logger.log('API escuchando', 'Bootstrap');
    logger.error('boom', 'Error: boom\n    at x', 'Exceptions');
    await flush();

    const [info, error] = lines();
    expect(info).toMatchObject({ level: 'log', context: 'Bootstrap', msg: 'API escuchando' });
    expect(error).toMatchObject({
      level: 'error',
      context: 'Exceptions',
      msg: 'boom',
      stack: 'Error: boom\n    at x',
    });
    expect(typeof info!.time).toBe('string');
    expect(err).toHaveBeenCalledTimes(1);
  });

  it('every line of a request carries that request’s id', async () => {
    const logger = new JsonLogger({ directory: dir });
    const req = Object.assign(new EventEmitter(), {
      method: 'GET',
      originalUrl: '/api/v2/transactions?search=privado',
      header: () => undefined,
    }) as unknown as Request;
    const res = Object.assign(new EventEmitter(), {
      statusCode: 200,
      setHeader: jest.fn(),
    }) as unknown as Response;
    let seen: string | undefined;

    requestContext((entry) => logger.entry(entry))(req, res, () => {
      seen = currentRequestId();
      logger.log('inside the request', 'Service');
    });
    (res as unknown as EventEmitter).emit('finish');
    await flush();

    const [inside, access] = lines();
    expect(seen).toBeDefined();
    expect(inside!.requestId).toBe(seen);
    expect(access).toMatchObject({
      requestId: seen,
      context: 'http',
      method: 'GET',
      path: '/api/v2/transactions',
      status: 200,
    });
    // The query string —search terms, personal data— never reaches the log.
    expect(JSON.stringify(access)).not.toContain('privado');
  });

  it('rotates by size and keeps the configured number of files', async () => {
    const logger = new JsonLogger({ directory: dir, maxBytes: 200, keep: 2 });
    for (let index = 0; index < 20; index += 1) logger.log(`line ${index} ${'x'.repeat(40)}`);
    await flush();

    expect(existsSync(join(dir, 'api.log.1'))).toBe(true);
    expect(existsSync(join(dir, 'api.log.2'))).toBe(true);
    expect(existsSync(join(dir, 'api.log.3'))).toBe(false);
  });

  it('two processes on the same file: after one rotates, the other follows the new file', async () => {
    const first = new JsonLogger({ directory: dir, maxBytes: 300, keep: 3 });
    const second = new JsonLogger({ directory: dir, maxBytes: 300, keep: 3 });
    for (let index = 0; index < 6; index += 1) first.log(`first ${index} ${'x'.repeat(40)}`);
    second.log('second after the rotation');
    await flush();

    expect(existsSync(join(dir, 'api.log.1'))).toBe(true);
    expect(lines().map((line) => line.msg)).toContain('second after the rotation');
  });

  it('drops lines below the minimum level', async () => {
    const logger = new JsonLogger({ directory: dir, minLevel: 'warn' });
    logger.log('quiet');
    logger.warn('loud');
    await flush();

    expect(lines().map((line) => line.msg)).toEqual(['loud']);
  });

  it('in production logs outside the release folder by default; elsewhere only to stdout', () => {
    expect(defaultLogDirectory({ NODE_ENV: 'production' })).toMatch(/logs\/coco-api$/);
    expect(defaultLogDirectory({ NODE_ENV: 'development' })).toBeUndefined();
    expect(defaultLogDirectory({ NODE_ENV: 'production', LOG_DIR: '/x' })).toBe('/x');
    expect(parseLogLevel('debug')).toBe('debug');
    expect(parseLogLevel('nonsense')).toBe('log');
  });
});
