import { Body, Controller, Get, HttpCode, HttpStatus, Post, Req, Res } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiHeader } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { CookieOptions, Request, Response } from 'express';

import {
  AuthService,
  type ContextoDePeticion,
  type ParDeTokens,
  type PerfilConFlags,
  type PerfilPublico,
} from './auth.service';
import { ChangePasswordDto, LoginDto, RefreshNativoDto, RegisterDto } from './dto/auth.dto';
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
import { FlagsService } from '../flags/flags.service';

/** El refresh token viaja SOLO en esta cookie; nunca en el cuerpo ni en la URL. */
const COOKIE_REFRESH = 'coco_refresh';
const REFRESH_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export interface RespuestaDeSesion {
  access_token: string;
  expires_in: number;
  user: PerfilPublico;
  /** Solo para un cliente nativo. La web nunca lo recibe en el cuerpo. */
  refresh_token?: string;
}

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
const CABECERA_CLIENTE = 'x-coco-cliente';
const CLIENTE_NATIVO = 'nativo';

/** How the OpenAPI document tells a native client which header to send. */
const NATIVE_CLIENT_HEADER = {
  name: CABECERA_CLIENTE,
  required: false,
  enum: [CLIENTE_NATIVO],
  description:
    'Native clients send `nativo`: the refresh token then travels in the body ' +
    '(`refresh_token`) instead of the httpOnly `coco_refresh` cookie the web uses.',
};

function esClienteNativo(request: Request): boolean {
  const valor = request.headers[CABECERA_CLIENTE];
  return (Array.isArray(valor) ? valor[0] : valor) === CLIENTE_NATIVO;
}

@ApiPublic()
@Controller('auth')
export class AuthController {
  private readonly enProduccion: boolean;

  constructor(
    private readonly auth: AuthService,
    private readonly flags: FlagsService,
    config: ConfigService,
  ) {
    this.enProduccion = config.get<string>('NODE_ENV') === 'production';
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
  async registrar(
    @Body() dto: RegisterDto,
    @Req() request: Request,
  ): Promise<{ pending_approval: boolean; message: string }> {
    const { pendienteDeAprobacion } = await this.auth.registrar(dto, contextoDe(request));

    return {
      pending_approval: pendienteDeAprobacion,
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
  @ApiData(SessionResponse)
  @ApiErrors(400, 401, 403)
  async entrar(
    @Body() dto: LoginDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<RespuestaDeSesion> {
    const { tokens, perfil } = await this.auth.entrar(dto, contextoDe(request));
    return this.entregarSesion(request, response, tokens, perfil);
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
  async refrescar(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
    @Body() cuerpo: RefreshNativoDto,
  ): Promise<RespuestaDeSesion> {
    const refreshToken = this.refreshTokenDe(request, cuerpo);
    if (!refreshToken) {
      throw new AuthenticationError('No hay sesión que renovar.');
    }

    try {
      const { tokens, perfil } = await this.auth.refrescar(refreshToken, contextoDe(request));
      return this.entregarSesion(request, response, tokens, perfil);
    } catch (error) {
      // Si la sesión murió, la cookie sobra: dejarla haría que el cliente
      // reintentara en bucle contra un token que ya no sirve. A un cliente
      // nativo no se le borra nada: el token vive en su llavero, y el 401 le
      // dice que lo tire.
      if (!esClienteNativo(request)) this.borrarCookie(response);
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
  async salir(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
    @Body() cuerpo: RefreshNativoDto,
  ): Promise<void> {
    await this.auth.salir(this.refreshTokenDe(request, cuerpo), contextoDe(request));
    if (!esClienteNativo(request)) this.borrarCookie(response);
  }

  /** Cierra la sesión en todos los dispositivos, con efecto inmediato. */
  @Post('logout-all')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiAuthenticated()
  @ApiNoContent()
  async salirDeTodo(
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    await this.auth.salirDeTodoslosDispositivos(user.id, contextoDe(request));
    this.borrarCookie(response);
  }

  /** `features`: the flags on for this user (step 7.8), read by the web and iOS. */
  @Get('me')
  @ApiAuthenticated()
  @ApiData(MeResponse)
  async perfil(@CurrentUser() user: AuthenticatedUser): Promise<PerfilConFlags> {
    const [perfil, features] = await Promise.all([
      this.auth.perfilDe(user.id),
      this.flags.activeFor(user.id),
    ]);
    return { ...perfil, features };
  }

  @Post('change-password')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiAuthenticated()
  @ApiNoContent()
  @ApiErrors(400, 422)
  async cambiarContrasena(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: ChangePasswordDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    await this.auth.cambiarContrasena(
      user.id,
      { actual: dto.currentPassword, nueva: dto.newPassword },
      contextoDe(request),
    );
    // Cambiar la contraseña cierra todas las sesiones, incluida esta: si un
    // atacante tenía una abierta, muere aquí.
    this.borrarCookie(response);
  }

  // ── Web o nativo ───────────────────────────────────────────────────────────

  /**
   * De dónde sale el refresh token: del cuerpo si el cliente es nativo, de la
   * cookie si no. Nunca de los dos a la vez: un cliente nativo que mandara
   * también una cookie estaría mezclando dos mundos, y se le hace caso al
   * suyo.
   */
  private refreshTokenDe(request: Request, cuerpo: RefreshNativoDto): string | undefined {
    if (esClienteNativo(request)) return cuerpo.refresh_token?.trim() || undefined;
    return leerCookie(request, COOKIE_REFRESH);
  }

  /** La sesión, por donde corresponda: cookie para la web, cuerpo para la app. */
  private entregarSesion(
    request: Request,
    response: Response,
    tokens: ParDeTokens,
    perfil: PerfilPublico,
  ): RespuestaDeSesion {
    if (esClienteNativo(request)) {
      return { ...respuestaDeSesion(tokens, perfil), refresh_token: tokens.refreshToken };
    }
    this.ponerCookie(response, tokens.refreshToken);
    return respuestaDeSesion(tokens, perfil);
  }

  // ── Cookie ─────────────────────────────────────────────────────────────────

  /**
   * `httpOnly` para que ningún JavaScript pueda leerla —ni siquiera el nuestro,
   * ni un XSS—. `sameSite: strict` para que no viaje en peticiones iniciadas
   * desde otro sitio, que es lo que neutraliza el CSRF sobre este endpoint.
   * `path` acotado a /auth para que no se envíe en cada llamada a la API.
   */
  private opcionesDeCookie(): CookieOptions {
    return {
      httpOnly: true,
      secure: this.enProduccion,
      sameSite: 'strict',
      path: '/api/v1/auth',
    };
  }

  private ponerCookie(response: Response, refreshToken: string): void {
    response.cookie(COOKIE_REFRESH, refreshToken, {
      ...this.opcionesDeCookie(),
      maxAge: REFRESH_TTL_MS,
    });
  }

  private borrarCookie(response: Response): void {
    response.clearCookie(COOKIE_REFRESH, this.opcionesDeCookie());
  }
}

function respuestaDeSesion(tokens: ParDeTokens, perfil: PerfilPublico): RespuestaDeSesion {
  // El refresh token NO se devuelve en el cuerpo: solo va en la cookie httpOnly.
  return {
    access_token: tokens.accessToken,
    expires_in: tokens.expiresIn,
    user: perfil,
  };
}

function contextoDe(request: Request): ContextoDePeticion {
  return {
    ip: request.ip,
    userAgent: request.headers['user-agent'],
  };
}

function leerCookie(request: Request, nombre: string): string | undefined {
  // cookie-parser deja aquí las cookies ya decodificadas. Express no las tipa,
  // así que se estrecha explícitamente en vez de arrastrar un `any`.
  const cookies: unknown = (request as Request & { cookies?: unknown }).cookies;
  if (typeof cookies !== 'object' || cookies === null) return undefined;

  const valor = (cookies as Record<string, unknown>)[nombre];
  return typeof valor === 'string' ? valor : undefined;
}
