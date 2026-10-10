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
import { PROBLEM_TYPE_BASE } from '../errors/problem-codes';

interface Sent {
  status: number;
  body: unknown;
  contentType?: string;
}

/** Runs the filter on one exception and returns what it sent. */
function send(exception: unknown, url = '/api/v2/x?q=secret'): Sent {
  const sent: Sent = { status: 0, body: undefined };
  const response = {
    status(code: number) {
      sent.status = code;
      return this;
    },
    setHeader(_name: string, value: string) {
      sent.contentType = value;
      return this;
    },
    json(body: unknown) {
      sent.body = body;
    },
  };
  const host = {
    switchToHttp: () => ({
      getResponse: () => response,
      getRequest: () => ({ method: 'GET', url, originalUrl: url, user: undefined }),
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
    ['PayloadTooLargeError', new PayloadTooLargeError('Pesa.'), 413, 'payload_too_large'],
    [
      'UnsupportedMediaTypeError',
      new UnsupportedMediaTypeError('Formato.'),
      415,
      'unsupported_media_type',
    ],
    ['ValidationError', new ValidationError('Regla.'), 422, 'validation_failed'],
    ['InternalError', new InternalError('Caído.'), 500, 'internal_error'],
    ['ServiceUnavailableError', new ServiceUnavailableError('Luego.'), 503, 'service_unavailable'],
  ];

  it.each(cases)('maps %s to its status and code', (_name, error, status, code) => {
    const sent = send(error);
    expect(sent.status).toBe(status);
    expect(sent.body).toMatchObject({ status, code, detail: error.message });
    expect(sent.body).not.toHaveProperty('errors');
  });

  it('answers a DuplicateError exactly like an unhandled unique violation', () => {
    expect(send(new DuplicateError())).toMatchObject({
      status: 409,
      body: { code: 'duplicate', detail: 'Ya existe un registro con esos datos.' },
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
      new ValidationError('m', { details: [{ field: 'f', message: 'x' }] }),
      new UnprocessableEntityException({ message: 'm', details: [{ field: 'f', message: 'x' }] }),
    ],
  ];

  it.each(pairs)('answers %s exactly like the Nest exception it replaced', (_s, domain, http) => {
    expect(send(domain)).toEqual(send(http));
  });
});

describe('AllExceptionsFilter as problem+json (RFC 9457)', () => {
  beforeAll(() => {
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });

  afterAll(() => {
    jest.restoreAllMocks();
  });

  it('answers application/problem+json with the code of the rule', () => {
    const sent = send(new ValidationError('El desglose no cuadra.', { code: 'splits_unbalanced' }));
    expect(sent.contentType).toBe('application/problem+json; charset=utf-8');
    expect(sent).toMatchObject({
      status: 422,
      body: {
        type: `${PROBLEM_TYPE_BASE}splits_unbalanced`,
        title: 'El desglose no cuadra',
        status: 422,
        detail: 'El desglose no cuadra.',
        code: 'splits_unbalanced',
      },
    });
    expect(sent.body).not.toHaveProperty('errors');
  });

  const fallbacks: [string, DomainError, number, string][] = [
    ['BadRequestError', new BadRequestError('a'), 400, 'bad_request'],
    ['AuthenticationError', new AuthenticationError('a'), 401, 'unauthenticated'],
    ['ForbiddenError', new ForbiddenError('a'), 403, 'forbidden'],
    ['NotFoundError', new NotFoundError('a'), 404, 'not_found'],
    ['ConflictError', new ConflictError('a'), 409, 'conflict'],
    ['DuplicateError', new DuplicateError(), 409, 'duplicate'],
    ['PayloadTooLargeError', new PayloadTooLargeError('a'), 413, 'payload_too_large'],
    [
      'UnsupportedMediaTypeError',
      new UnsupportedMediaTypeError('a'),
      415,
      'unsupported_media_type',
    ],
    ['ValidationError', new ValidationError('a'), 422, 'validation_failed'],
    ['InternalError', new InternalError('a'), 500, 'internal_error'],
    ['ServiceUnavailableError', new ServiceUnavailableError('a'), 503, 'service_unavailable'],
  ];

  it.each(fallbacks)(
    'without a rule, %s goes out with the code of its kind',
    (_n, error, status, code) => {
      expect(send(error)).toMatchObject({ status, body: { status, code } });
    },
  );

  it('points each invalid field at its path', () => {
    const http = new BadRequestException({
      message: ['splits.0.amount mal'],
      error: 'Bad Request',
      statusCode: 400,
      fields: [{ field: 'splits.0.amount', message: 'mal' }],
    });
    expect(send(http).body).toEqual({
      type: `${PROBLEM_TYPE_BASE}invalid_fields`,
      title: 'Hay campos inválidos',
      status: 400,
      detail: 'Hay campos inválidos en la solicitud.',
      code: 'invalid_fields',
      errors: [{ field: 'splits.0.amount', message: 'mal' }],
    });
  });

  it('keeps the details of a domain error as errors', () => {
    const details = [{ field: 'password', message: 'Muy corta.' }];
    const body = send(new ValidationError('No cumple.', { code: 'weak_password', details })).body;
    expect(body).toMatchObject({ code: 'weak_password', errors: details });
  });

  it('never leaks what an unexpected error says', () => {
    expect(send(new Error('SELECT * FROM users')).body).toEqual({
      type: `${PROBLEM_TYPE_BASE}internal_error`,
      title: 'Error interno',
      status: 500,
      detail: 'Ocurrió un error inesperado. Intenta de nuevo.',
      code: 'internal_error',
    });
  });
});
