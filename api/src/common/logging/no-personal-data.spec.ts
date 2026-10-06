import { Logger, type ArgumentsHost } from '@nestjs/common';
import { EventEmitter } from 'node:events';

import { requestContext } from './request-context';
import { InternalError, NotFoundError, ValidationError } from '../errors/domain-error';
import { AllExceptionsFilter } from '../filters/all-exceptions.filter';

/**
 * Step 7.11: the two places that log EVERY request that goes wrong or comes
 * through —the exceptions filter and the access line— never write personal
 * data or money (CONTRIBUTING, "Logs").
 *
 * The request below carries an email, an amount and a description in its
 * query string AND in its body, the way a search or a form would. None of
 * them may reach a log line; the method, the path and the internal user id
 * may.
 */

const EMAIL = 'ana.privada@correo.test';
const AMOUNT = '987654.32';
const DESCRIPTION = 'Consulta-Psicologia-Privada';
const QUERY = `q=${encodeURIComponent(EMAIL)}&amount=${AMOUNT}&description=${DESCRIPTION}`;
const PATH = '/api/v2/transactions';

const FORBIDDEN = [EMAIL, encodeURIComponent(EMAIL), AMOUNT, DESCRIPTION, QUERY, '?'];

const request = {
  method: 'POST',
  url: `${PATH}?${QUERY}`,
  originalUrl: `${PATH}?${QUERY}`,
  query: { q: EMAIL, amount: AMOUNT, description: DESCRIPTION },
  body: { email: EMAIL, amount: AMOUNT, description: DESCRIPTION },
  user: { id: 42n, email: EMAIL },
  header: (): undefined => undefined,
};

function expectClean(lines: string[]): void {
  expect(lines.length).toBeGreaterThan(0);
  for (const line of lines) {
    for (const value of FORBIDDEN) expect(line).not.toContain(value);
  }
}

describe('Logs carry no personal data and no amounts', () => {
  let logged: string[];

  beforeEach(() => {
    logged = [];
    const capture = (...args: unknown[]): void => {
      logged.push(
        args.map((arg) => (typeof arg === 'string' ? arg : JSON.stringify(arg))).join(' '),
      );
    };
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(capture);
    jest.spyOn(Logger.prototype, 'error').mockImplementation(capture);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it.each([
    ['a 4xx', new NotFoundError('No existe.')],
    ['a validation error', new ValidationError('Revisa el monto.')],
    ['a 5xx, with its stack', new InternalError('Algo falló.')],
    ['an unknown throw', new Error('boom')],
  ])('the exceptions filter, on %s', (_label, exception) => {
    const response = {
      status: () => response,
      setHeader: () => response,
      json: () => undefined,
    };
    const host = {
      switchToHttp: () => ({ getResponse: () => response, getRequest: () => request }),
    } as unknown as ArgumentsHost;

    new AllExceptionsFilter().catch(exception, host);

    expectClean(logged);
    // What it does keep is enough to find the request again.
    expect(logged[0]).toContain(`POST ${PATH} `);
    expect(logged[0]).toContain('user=42');
  });

  it('the access line', () => {
    const entries: Record<string, unknown>[] = [];
    const response = Object.assign(new EventEmitter(), {
      statusCode: 201,
      setHeader: (): undefined => undefined,
    });

    requestContext((entry) => entries.push(entry))(
      request as never,
      response as never,
      () => undefined,
    );
    response.emit('finish');

    expectClean(entries.map((entry) => JSON.stringify(entry)));
    expect(entries[0]).toMatchObject({ method: 'POST', path: PATH, status: 201, userId: '42' });
  });
});
