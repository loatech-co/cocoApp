import { EventEmitter } from 'node:events';

import { installSafetyNet } from './safety-net';

/** A process stand-in: the real one would end the test run. */
function fakeProcess(): EventEmitter & { exit: jest.Mock } {
  return Object.assign(new EventEmitter(), { exit: jest.fn() });
}

describe('safety net', () => {
  it.each([
    ['uncaughtException', new Error('PANIC: timer has gone away')],
    ['unhandledRejection', new Error('rejected')],
  ])('%s logs and exits with 0, so LiteSpeed respawns without a penalty', (event, error) => {
    const proc = fakeProcess();
    const logger = { error: jest.fn() };
    installSafetyNet(proc as unknown as NodeJS.Process, logger);

    proc.emit(event, error);

    expect(logger.error).toHaveBeenCalledTimes(1);
    expect(proc.exit).toHaveBeenCalledWith(0);
  });
});
