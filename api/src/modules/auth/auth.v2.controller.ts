import { Body, Controller, Get, HttpCode, HttpStatus, Post, Req, Res } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiHeader } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { CookieOptions, Request, Response } from 'express';

import {
  AuthService,
  type RequestContext,
  type TokenPair,
  type Me as MeBody,
  type Profile,
} from './auth.service';
import { ChangePasswordDto, LoginDto, RegisterDto } from './dto/auth.dto';
import { RefreshInput } from './dto/v2/auth.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { AuthenticationError } from '../../common/errors/domain-error';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';
import { Me, Registration, Session } from '../../contract/v2/auth.response';
import {
  ApiAuthenticated,
  ApiErrors,
  ApiNoContent,
  ApiPublic,
  ApiDataV2,
} from '../../contract/v2/openapi.decorators';
import { meV2, sessionV2, type SessionV2 } from '../../presenters/v2/auth.presenter';
import { FlagsService } from '../flags/flags.service';

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

function contextOf(request: Request): RequestContext {
  return { ip: request.ip, userAgent: request.headers['user-agent'] };
}

function readCookie(request: Request, name: string): string | undefined {
  const cookies: unknown = (request as Request & { cookies?: unknown }).cookies;
  if (typeof cookies !== 'object' || cookies === null) return undefined;
  const value = (cookies as Record<string, unknown>)[name];
  return typeof value === 'string' ? value : undefined;
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
    private readonly flags: FlagsService,
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
    const { isPendingApproval } = await this.auth.register(input, contextOf(request));
    return {
      pendingApproval: isPendingApproval,
      message: isPendingApproval
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
  ): Promise<SessionV2> {
    const { tokens, profile } = await this.auth.signIn(input, contextOf(request));
    return this.deliver(request, response, tokens, profile);
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
  ): Promise<SessionV2> {
    const refreshToken = this.refreshTokenOf(request, input);
    if (!refreshToken) {
      throw new AuthenticationError('No hay sesión que renovar.', { code: 'session_expired' });
    }
    try {
      const { tokens, profile } = await this.auth.refresh(refreshToken, contextOf(request));
      return this.deliver(request, response, tokens, profile);
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
    await this.auth.signOut(this.refreshTokenOf(request, input), contextOf(request));
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
    await this.auth.signOutEverywhere(user.id, contextOf(request));
    this.clearCookie(response);
  }

  @Get('me')
  @ApiAuthenticated()
  @ApiDataV2(Me)
  async me(@CurrentUser() user: AuthenticatedUser): Promise<MeBody> {
    const [profile, features] = await Promise.all([
      this.auth.getProfile(user.id),
      this.flags.activeFor(user.id),
    ]);
    return meV2({ ...profile, features });
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
    await this.auth.changePassword(
      user.id,
      { currentPassword: input.currentPassword, newPassword: input.newPassword },
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
    tokens: TokenPair,
    profile: Profile,
  ): SessionV2 {
    if (isNativeClient(request)) return sessionV2(tokens, profile, true);
    response.cookie(REFRESH_COOKIE, tokens.refreshToken, {
      ...this.cookieOptions(),
      maxAge: REFRESH_TTL_MS,
    });
    return sessionV2(tokens, profile, false);
  }

  private cookieOptions(): CookieOptions {
    return { httpOnly: true, secure: this.inProduction, sameSite: 'strict', path: COOKIE_PATH };
  }

  private clearCookie(response: Response): void {
    response.clearCookie(REFRESH_COOKIE, this.cookieOptions());
  }
}
