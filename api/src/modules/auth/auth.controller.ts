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

/** El refresh token viaja SOLO en esta cookie; nunca en el cuerpo ni en la URL. */
const COOKIE_REFRESH = 'coco_refresh';
const REFRESH_TTL_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * ── El cliente nativo ───────────────────────────────────────────────────────
 * La web guarda el refresh token en una cookie `httpOnly; sameSite: strict`,
 * que es lo correcto para un navegador: ningún script la lee. Una app del
 * teléfono no puede mantener esa cookie, así que, si se identifica con esta
 * cabecera, el refresh token entra y sale por el CUERPO y ella lo guarda en el
 * llavero del sistema.
 *
 * Por cabecera y no por un campo del cuerpo porque es una propiedad del
 * cliente y no de la petición —`refresh` y `logout` no llevan cuerpo en la
 * web— y así los mismos tres endpoints sirven a los dos sin que la web cambie
 * en nada. Lo que NO cambia para nadie: el token rota en cada renovación, la
 * revocación por `sessions_valid_from` aplica igual, y los límites de
 * intentos son los mismos.
 *
 * Nunca en la URL: una URL queda en registros de servidores, proxies e
 * historiales.
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

  // ── Público ────────────────────────────────────────────────────────────────

  /**
   * Límite estricto: cada intento crea una cuenta en Supabase y una fila aquí,
   * y consulta el servicio de contraseñas filtradas. Sin tope sería un vector
   * de agotamiento de recursos ajenos, además de los propios.
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
    const { pendingApproval } = await this.auth.register(dto, contextOf(request));

    return {
      pending_approval: pendingApproval,
      message: pendingApproval
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
   * Renueva el access token. Es público porque el access token ya expiró: la
   * credencial aquí es la cookie de refresh.
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
      // Si la sesión murió, la cookie sobra: dejarla haría que el cliente
      // reintentara en bucle contra un token que ya no sirve. A un cliente
      // nativo no se le borra nada: el token vive en su llavero, y el 401 le
      // dice que lo tire.
      if (!isNativeClient(request)) this.clearCookie(response);
      throw error;
    }
  }

  /**
   * Cerrar sesión es público a propósito: la credencial aquí es la cookie, no
   * el access token. Si exigiera un access token vigente, quien lo tuviera
   * expirado quedaría en un callejón sin salida —sin poder cerrar sesión y con
   * la cookie de refresh todavía viva—, que es justo lo contrario de lo que
   * uno quiere de un botón de "salir".
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

  /** Cierra la sesión en todos los dispositivos, con efecto inmediato. */
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
    // Cambiar la contraseña cierra todas las sesiones, incluida esta: si un
    // atacante tenía una abierta, muere aquí.
    this.clearCookie(response);
  }

  // ── Web o nativo ───────────────────────────────────────────────────────────

  /**
   * De dónde sale el refresh token: del cuerpo si el cliente es nativo, de la
   * cookie si no. Nunca de los dos a la vez: un cliente nativo que mandara
   * también una cookie estaría mezclando dos mundos, y se le hace caso al
   * suyo.
   */
  private refreshTokenOf(request: Request, body: RefreshNativeDto): string | undefined {
    if (isNativeClient(request)) return body.refresh_token?.trim() || undefined;
    return readCookie(request, COOKIE_REFRESH);
  }

  /** La sesión, por donde corresponda: cookie para la web, cuerpo para la app. */
  private deliverSession(
    request: Request,
    response: Response,
    tokens: TokenPair,
    profile: Profile,
  ): SessionV1 {
    if (isNativeClient(request)) return sessionV1(tokens, profile, true);
    // El refresh token NO se devuelve en el cuerpo: solo va en la cookie httpOnly.
    this.setCookie(response, tokens.refreshToken);
    return sessionV1(tokens, profile, false);
  }

  // ── Cookie ─────────────────────────────────────────────────────────────────

  /**
   * `httpOnly` para que ningún JavaScript pueda leerla —ni siquiera el nuestro,
   * ni un XSS—. `sameSite: strict` para que no viaje en peticiones iniciadas
   * desde otro sitio, que es lo que neutraliza el CSRF sobre este endpoint.
   * `path` acotado a /auth para que no se envíe en cada llamada a la API.
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
  // cookie-parser deja aquí las cookies ya decodificadas. Express no las tipa,
  // así que se estrecha explícitamente en vez de arrastrar un `any`.
  const cookies: unknown = (request as Request & { cookies?: unknown }).cookies;
  if (typeof cookies !== 'object' || cookies === null) return undefined;

  const value = (cookies as Record<string, unknown>)[name];
  return typeof value === 'string' ? value : undefined;
}
