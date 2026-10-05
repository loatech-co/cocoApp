import { Body, Controller, Get, HttpCode, HttpStatus, Post, Req, Res } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiHeader } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { CookieOptions, Request, Response } from 'express';

import type { RespuestaDeSesion } from './auth.controller';
import {
  AuthService,
  type ContextoDePeticion,
  type ParDeTokens,
  type PerfilPublico,
} from './auth.service';
import { ChangePasswordDto, LoginDto, RegisterDto } from './dto/auth.dto';
import { RefreshInput } from './dto/v2/auth.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { AuthenticationError } from '../../common/errors/domain-error';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';
import {
  ApiAuthenticated,
  ApiErrors,
  ApiNoContent,
  ApiPublic,
} from '../../contract/v1/openapi.decorators';
import { Profile, Registration, Session } from '../../contract/v2/auth.response';
import { ApiDataV2 } from '../../contract/v2/openapi.decorators';
import { toV2, type ToV2 } from '../../contract/v2/to-v2';

const REFRESH_COOKIE = 'coco_refresh';
const REFRESH_TTL_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * The cookie is scoped to the v2 auth routes, as v1's is to its own: the
 * browser sends it to refresh and logout and to nothing else. One consequence,
 * accepted: a web session opened on v1 does not carry over, so moving the web
 * to v2 asks each user to sign in once.
 */
const COOKIE_PATH = '/api/v2/auth';

/** v1 said `x-coco-cliente: nativo`; v2 says it in English. */
const CLIENT_HEADER = 'x-coco-client';
const NATIVE_CLIENT = 'native';

const NATIVE_CLIENT_HEADER = {
  name: CLIENT_HEADER,
  required: false,
  enum: [NATIVE_CLIENT],
  description:
    'Native clients send `native`: the refresh token then travels in the body ' +
    '(`refreshToken`) instead of the httpOnly `coco_refresh` cookie the web uses.',
};

function isNativeClient(request: Request): boolean {
  const value = request.headers[CLIENT_HEADER];
  return (Array.isArray(value) ? value[0] : value) === NATIVE_CLIENT;
}

function contextOf(request: Request): ContextoDePeticion {
  return { ip: request.ip, userAgent: request.headers['user-agent'] };
}

function readCookie(request: Request, name: string): string | undefined {
  const cookies: unknown = (request as Request & { cookies?: unknown }).cookies;
  if (typeof cookies !== 'object' || cookies === null) return undefined;
  const value = (cookies as Record<string, unknown>)[name];
  return typeof value === 'string' ? value : undefined;
}

function sessionOf(tokens: ParDeTokens, profile: PerfilPublico): RespuestaDeSesion {
  return { access_token: tokens.accessToken, expires_in: tokens.expiresIn, user: profile };
}

/**
 * v2 of the session routes: the same service and the same rules as v1 —
 * throttling, the web's httpOnly cookie, the native client's token in the
 * body — with English names on the wire.
 */
@ApiPublic()
@Controller({ path: 'auth', version: '2' })
export class AuthV2Controller {
  private readonly inProduction: boolean;

  constructor(
    private readonly auth: AuthService,
    config: ConfigService,
  ) {
    this.inProduction = config.get<string>('NODE_ENV') === 'production';
  }

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('register')
  @ApiDataV2(Registration, { status: 201 })
  @ApiErrors(400, 409, 422)
  async register(
    @Body() input: RegisterDto,
    @Req() request: Request,
  ): Promise<{ pendingApproval: boolean; message: string }> {
    const { pendienteDeAprobacion } = await this.auth.registrar(input, contextOf(request));
    return {
      pendingApproval: pendienteDeAprobacion,
      message: pendienteDeAprobacion
        ? 'Recibimos tu solicitud. Un administrador debe aprobarla antes de que puedas entrar.'
        : 'Tu cuenta de administrador quedó lista. Ya puedes entrar.',
    };
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiHeader(NATIVE_CLIENT_HEADER)
  @ApiDataV2(Session)
  @ApiErrors(400, 401, 403)
  async login(
    @Body() input: LoginDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<ToV2<RespuestaDeSesion>> {
    const { tokens, perfil } = await this.auth.entrar(input, contextOf(request));
    return this.deliver(request, response, tokens, perfil);
  }

  @Public()
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiHeader(NATIVE_CLIENT_HEADER)
  @ApiDataV2(Session)
  @ApiErrors(400, 401, 403)
  async refresh(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
    @Body() input: RefreshInput,
  ): Promise<ToV2<RespuestaDeSesion>> {
    const refreshToken = this.refreshTokenOf(request, input);
    if (!refreshToken) {
      throw new AuthenticationError('No hay sesión que renovar.');
    }
    try {
      const { tokens, perfil } = await this.auth.refrescar(refreshToken, contextOf(request));
      return this.deliver(request, response, tokens, perfil);
    } catch (error) {
      // A refresh token that no longer works must not stay in the browser.
      if (!isNativeClient(request)) this.clearCookie(response);
      throw error;
    }
  }

  @Public()
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiHeader(NATIVE_CLIENT_HEADER)
  @ApiNoContent()
  @ApiErrors(400)
  async logout(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
    @Body() input: RefreshInput,
  ): Promise<void> {
    await this.auth.salir(this.refreshTokenOf(request, input), contextOf(request));
    if (!isNativeClient(request)) this.clearCookie(response);
  }

  @Post('logout-all')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiAuthenticated()
  @ApiNoContent()
  async logoutAll(
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    await this.auth.salirDeTodoslosDispositivos(user.id, contextOf(request));
    this.clearCookie(response);
  }

  @Get('me')
  @ApiAuthenticated()
  @ApiDataV2(Profile)
  async me(@CurrentUser() user: AuthenticatedUser): Promise<ToV2<PerfilPublico>> {
    return toV2(await this.auth.perfilDe(user.id));
  }

  @Post('change-password')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiAuthenticated()
  @ApiNoContent()
  @ApiErrors(400, 422)
  async changePassword(
    @CurrentUser() user: AuthenticatedUser,
    @Body() input: ChangePasswordDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    await this.auth.cambiarContrasena(
      user.id,
      { actual: input.currentPassword, nueva: input.newPassword },
      contextOf(request),
    );
    this.clearCookie(response);
  }

  private refreshTokenOf(request: Request, input: RefreshInput): string | undefined {
    if (isNativeClient(request)) return input.refreshToken?.trim() || undefined;
    return readCookie(request, REFRESH_COOKIE);
  }

  /** The web gets its refresh token as a cookie; a native client, in the body. */
  private deliver(
    request: Request,
    response: Response,
    tokens: ParDeTokens,
    profile: PerfilPublico,
  ): ToV2<RespuestaDeSesion> {
    if (isNativeClient(request)) {
      return toV2({ ...sessionOf(tokens, profile), refresh_token: tokens.refreshToken });
    }
    response.cookie(REFRESH_COOKIE, tokens.refreshToken, {
      ...this.cookieOptions(),
      maxAge: REFRESH_TTL_MS,
    });
    return toV2(sessionOf(tokens, profile));
  }

  private cookieOptions(): CookieOptions {
    return { httpOnly: true, secure: this.inProduction, sameSite: 'strict', path: COOKIE_PATH };
  }

  private clearCookie(response: Response): void {
    response.clearCookie(REFRESH_COOKIE, this.cookieOptions());
  }
}
