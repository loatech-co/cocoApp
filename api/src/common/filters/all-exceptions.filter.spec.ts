import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  PayloadTooLargeException,
  ServiceUnavailableException,
  UnauthorizedException,
  UnprocessableEntityException,
  UnsupportedMediaTypeException,
  type ArgumentsHost,
  type HttpException,
} from '@nestjs/common';

import { AllExceptionsFilter } from './all-exceptions.filter';
import {
  AuthenticationError,
  BadRequestError,
  ConflictError,
  DuplicateError,
  ForbiddenError,
  InternalError,
  NotFoundError,
  PayloadTooLargeError,
  ServiceUnavailableError,
  UnsupportedMediaTypeError,
  ValidationError,
  type DomainError,
} from '../errors/domain-error';

interface Sent {
  status: number;
  body: unknown;
}

/** Runs the filter on one exception and returns what it sent. */
function send(exception: unknown): Sent {
  const sent: Sent = { status: 0, body: undefined };
  const response = {
    status(code: number) {
      sent.status = code;
      return this;
    },
    json(body: unknown) {
      sent.body = body;
    },
  };
  const host = {
    switchToHttp: () => ({
      getResponse: () => response,
      getRequest: () => ({ method: 'GET', url: '/api/v1/x?q=secret', user: undefined }),
    }),
  } as unknown as ArgumentsHost;

  new AllExceptionsFilter().catch(exception, host);
  return sent;
}

describe('AllExceptionsFilter with domain errors', () => {
  beforeAll(() => {
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });

  afterAll(() => {
    jest.restoreAllMocks();
  });

  const cases: [string, DomainError, number, string][] = [
    ['BadRequestError', new BadRequestError('Mal.'), 400, 'bad_request'],
    ['AuthenticationError', new AuthenticationError('Entra.'), 401, 'unauthenticated'],
    ['ForbiddenError', new ForbiddenError('No.'), 403, 'forbidden'],
    ['NotFoundError', new NotFoundError('No existe.'), 404, 'not_found'],
    ['ConflictError', new ConflictError('Choca.'), 409, 'conflict'],
    ['PayloadTooLargeError', new PayloadTooLargeError('Pesa.'), 413, 'error'],
    ['UnsupportedMediaTypeError', new UnsupportedMediaTypeError('Formato.'), 415, 'error'],
    ['ValidationError', new ValidationError('Regla.'), 422, 'unprocessable'],
    ['InternalError', new InternalError('Caído.'), 500, 'error'],
    ['ServiceUnavailableError', new ServiceUnavailableError('Luego.'), 503, 'error'],
  ];

  it.each(cases)('maps %s to its status and code', (_name, error, status, code) => {
    expect(send(error)).toEqual({
      status,
      body: { error: { code, message: error.message, details: [] } },
    });
  });

  it('answers a DuplicateError exactly like an unhandled unique violation', () => {
    expect(send(new DuplicateError())).toEqual({
      status: 409,
      body: {
        error: { code: 'duplicate', message: 'Ya existe un registro con esos datos.', details: [] },
      },
    });
  });

  it('keeps the details a domain error carries', () => {
    const details = [{ field: 'password', message: 'Muy corta.' }];

    expect(send(new ValidationError('La contraseña no cumple.', details)).body).toEqual({
      error: { code: 'unprocessable', message: 'La contraseña no cumple.', details },
    });
  });

  // The migration from Nest exceptions must not change a byte on the wire.
  const pairs: [string, DomainError, HttpException][] = [
    ['400', new BadRequestError('a'), new BadRequestException('a')],
    ['401', new AuthenticationError('a'), new UnauthorizedException('a')],
    ['403', new ForbiddenError('a'), new ForbiddenException('a')],
    ['404', new NotFoundError('a'), new NotFoundException('a')],
    ['409', new ConflictError('a'), new ConflictException('a')],
    ['413', new PayloadTooLargeError('a'), new PayloadTooLargeException('a')],
    ['415', new UnsupportedMediaTypeError('a'), new UnsupportedMediaTypeException('a')],
    ['422', new ValidationError('a'), new UnprocessableEntityException('a')],
    ['500', new InternalError('a'), new InternalServerErrorException('a')],
    ['503', new ServiceUnavailableError('a'), new ServiceUnavailableException('a')],
    [
      '422 with details',
      new ValidationError('m', [{ field: 'f', message: 'x' }]),
      new UnprocessableEntityException({ message: 'm', details: [{ field: 'f', message: 'x' }] }),
    ],
  ];

  it.each(pairs)('answers %s exactly like the Nest exception it replaced', (_s, domain, http) => {
    expect(send(domain)).toEqual(send(http));
  });
});
