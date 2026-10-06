import { Body, Controller, Get, HttpCode, HttpStatus, Post, Req, Res } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiHeader } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { CookieOptions, Request, Response } from 'express';

import { AuthService, type RequestContext, type TokenPair, type Profile } from './auth.service';
import { ChangePasswordDto, LoginDto, RefreshNativeDto, RegisterDto } from './dto/auth.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { AuthenticationError } from '../../common/errors/domain-error';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';
import { MeResponse, RegisterResponse, SessionResponse } from '../../contract/v1/auth.response';
import {
  ApiAuthenticated,
  ApiData,
  ApiErrors,
  ApiNoContent,
  ApiPublic,
} from '../../contract/v1/openapi.decorators';
import { meV1, sessionV1, type MeV1, type SessionV1 } from '../../presenters/v1/auth.presenter';
import { FlagsService } from '../flags/flags.service';

/** The refresh token travels ONLY in this cookie; never in the body or the URL. */
const COOKIE_REFRESH = 'coco_refresh';
const REFRESH_TTL_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * ── The native client ────────────────────────────────────────────────────────
 * The web keeps the refresh token in an `httpOnly; sameSite: strict` cookie,
 * which is right for a browser: no script reads it. A phone app cannot keep
 * that cookie, so, if it identifies itself with this header, the refresh
 * token goes in and out through the BODY and the app keeps it in the system
 * keychain.
 *
 * A header and not a body field because it is a property of the client and
 * not of the request —`refresh` and `logout` carry no body on the web— and
 * that way the same three endpoints serve both without the web changing at
 * all. What does NOT change for anyone: the token rotates on every renewal,
 * revocation through `sessions_valid_from` applies the same, and the attempt
 * limits are the same.
 *
 * Never in the URL: a URL ends up in server, proxy and browser history logs.
 */
const CLIENT_HEADER = 'x-coco-cliente';
const NATIVE_CLIENT = 'nativo';

/** How the OpenAPI document tells a native client which header to send. */
const NATIVE_CLIENT_HEADER = {
  name: CLIENT_HEADER,
  required: false,
  enum: [NATIVE_CLIENT],
  description:
    'Native clients send `nativo`: the refresh token then travels in the body ' +
    '(`refresh_token`) instead of the httpOnly `coco_refresh` cookie the web uses.',
};

function isNativeClient(request: Request): boolean {
  const value = request.headers[CLIENT_HEADER];
  return (Array.isArray(value) ? value[0] : value) === NATIVE_CLIENT;
}

@ApiPublic()
@Controller('auth')
export class AuthController {
  private readonly inProduction: boolean;

  constructor(
    private readonly auth: AuthService,
    private readonly flags: FlagsService,
    config: ConfigService,
  ) {
    this.inProduction = config.get<string>('NODE_ENV') === 'production';
  }

  // ── Public ─────────────────────────────────────────────────────────────────

  /**
   * Strict limit: every attempt creates an account in Supabase and a row here,
   * and queries the breached-passwords service. Without a cap it would be a
   * way to exhaust other people's resources, as well as ours.
   */
  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('register')
  @ApiData(RegisterResponse, { status: 201 })
  @ApiErrors(400, 409, 422)
  async register(
    @Body() dto: RegisterDto,
    @Req() request: Request,
  ): Promise<{ pending_approval: boolean; message: string }> {
    const { isPendingApproval } = await this.auth.register(dto, contextOf(request));

    return {
      pending_approval: isPendingApproval,
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
  @ApiData(SessionResponse)
  @ApiErrors(400, 401, 403)
  async login(
    @Body() dto: LoginDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<SessionV1> {
    const { tokens, profile } = await this.auth.signIn(dto, contextOf(request));
    return this.deliverSession(request, response, tokens, profile);
  }

  /**
   * Renews the access token. It is public because the access token has already
   * expired: the credential here is the refresh cookie.
   */
  @Public()
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiHeader(NATIVE_CLIENT_HEADER)
  @ApiData(SessionResponse)
  @ApiErrors(400, 401, 403)
  async refresh(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
    @Body() body: RefreshNativeDto,
  ): Promise<SessionV1> {
    const refreshToken = this.refreshTokenOf(request, body);
    if (!refreshToken) {
      throw new AuthenticationError('No hay sesión que renovar.', { code: 'session_expired' });
    }

    try {
      const { tokens, profile } = await this.auth.refresh(refreshToken, contextOf(request));
      return this.deliverSession(request, response, tokens, profile);
    } catch (error) {
      // If the session died, the cookie is useless: keeping it would make the
      // client retry in a loop against a token that no longer works. Nothing
      // is cleared for a native client: the token lives in its keychain, and
      // the 401 tells it to throw it away.
      if (!isNativeClient(request)) this.clearCookie(response);
      throw error;
    }
  }

  /**
   * Signing out is public on purpose: the credential here is the cookie, not
   * the access token. If it required a valid access token, someone whose token
   * had expired would be stuck —unable to sign out and with the refresh cookie
   * still alive—, which is the exact opposite of what one wants from a "sign
   * out" button.
   */
  @Public()
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiHeader(NATIVE_CLIENT_HEADER)
  @ApiNoContent()
  @ApiErrors(400)
  async logout(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
    @Body() body: RefreshNativeDto,
  ): Promise<void> {
    await this.auth.signOut(this.refreshTokenOf(request, body), contextOf(request));
    if (!isNativeClient(request)) this.clearCookie(response);
  }

  /** Signs out on every device, effective immediately. */
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

  /** `features`: the flags on for this user (step 7.8), read by the web and iOS. */
  @Get('me')
  @ApiAuthenticated()
  @ApiData(MeResponse)
  async me(@CurrentUser() user: AuthenticatedUser): Promise<MeV1> {
    const [profile, features] = await Promise.all([
      this.auth.getProfile(user.id),
      this.flags.activeFor(user.id),
    ]);
    return meV1({ ...profile, features });
  }

  @Post('change-password')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiAuthenticated()
  @ApiNoContent()
  @ApiErrors(400, 422)
  async changePassword(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: ChangePasswordDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    await this.auth.changePassword(
      user.id,
      { currentPassword: dto.currentPassword, newPassword: dto.newPassword },
      contextOf(request),
    );
    // Changing the password closes every session, this one included: if an
    // attacker had one open, it dies here.
    this.clearCookie(response);
  }

  // ── Web or native ──────────────────────────────────────────────────────────

  /**
   * Where the refresh token comes from: the body if the client is native, the
   * cookie otherwise. Never both at once: a native client that also sent a
   * cookie would be mixing two worlds, and its own one wins.
   */
  private refreshTokenOf(request: Request, body: RefreshNativeDto): string | undefined {
    if (isNativeClient(request)) return body.refresh_token?.trim() || undefined;
    return readCookie(request, COOKIE_REFRESH);
  }

  /** The session, through the right channel: cookie for the web, body for the app. */
  private deliverSession(
    request: Request,
    response: Response,
    tokens: TokenPair,
    profile: Profile,
  ): SessionV1 {
    if (isNativeClient(request)) return sessionV1(tokens, profile, true);
    // The refresh token is NOT returned in the body: it only goes in the httpOnly cookie.
    this.setCookie(response, tokens.refreshToken);
    return sessionV1(tokens, profile, false);
  }

  // ── Cookie ─────────────────────────────────────────────────────────────────

  /**
   * `httpOnly` so no JavaScript can read it —not even ours, nor an XSS—.
   * `sameSite: strict` so it does not travel on requests started from another
   * site, which is what neutralises CSRF on this endpoint. `path` narrowed to
   * /auth so it is not sent on every API call.
   */
  private cookieOptions(): CookieOptions {
    return {
      httpOnly: true,
      secure: this.inProduction,
      sameSite: 'strict',
      path: '/api/v1/auth',
    };
  }

  private setCookie(response: Response, refreshToken: string): void {
    response.cookie(COOKIE_REFRESH, refreshToken, {
      ...this.cookieOptions(),
      maxAge: REFRESH_TTL_MS,
    });
  }

  private clearCookie(response: Response): void {
    response.clearCookie(COOKIE_REFRESH, this.cookieOptions());
  }
}

function contextOf(request: Request): RequestContext {
  return {
    ip: request.ip,
    userAgent: request.headers['user-agent'],
  };
}

function readCookie(request: Request, name: string): string | undefined {
  // cookie-parser leaves the cookies here already decoded. Express does not
  // type them, so they are narrowed explicitly instead of dragging an `any`.
  const cookies: unknown = (request as Request & { cookies?: unknown }).cookies;
  if (typeof cookies !== 'object' || cookies === null) return undefined;

  const value = (cookies as Record<string, unknown>)[name];
  return typeof value === 'string' ? value : undefined;
}
