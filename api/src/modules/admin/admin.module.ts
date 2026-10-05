import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Injectable,
  Module,
  NotFoundException,
  Param,
  Post,
  Query,
  UseGuards,
  UnprocessableEntityException,
} from '@nestjs/common';
import type { UserRole, UserStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

import { AuditService } from '../../common/audit/audit.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles, RolesGuard } from '../../common/guards/roles.guard';
import { ParseBigIntPipe } from '../../common/pipes/parse-bigint.pipe';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';
import { PrismaService } from '../../prisma/prisma.service';
import { aPerfilPublico, type PerfilPublico } from '../auth/auth.service';
import { AuthService } from '../auth/auth.service';
import { PasswordService } from '../auth/password.service';
import { SupabaseAuthService } from '../auth/supabase-auth.service';

// ── DTOs ─────────────────────────────────────────────────────────────────────

export class ListUsersQueryDto {
  @IsOptional()
  @IsEnum(['pending', 'active', 'suspended'])
  status?: UserStatus;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  per_page?: number;
}

export class ChangeRoleDto {
  @IsEnum(['admin', 'user'])
  role!: UserRole;
}

export class ResetPasswordDto {
  @IsString()
  @MaxLength(128)
  newPassword!: string;
}

// ── Servicio ─────────────────────────────────────────────────────────────────

@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auth: AuthService,
    private readonly supabase: SupabaseAuthService,
    private readonly passwords: PasswordService,
    private readonly audit: AuditService,
  ) {}

  async listarUsuarios(
    filtros: ListUsersQueryDto,
  ): Promise<{ data: PerfilPublico[]; meta: { page: number; per_page: number; total: number } }> {
    const page = filtros.page ?? 1;
    const perPage = filtros.per_page ?? 50;
    const where = filtros.status ? { status: filtros.status } : {};

    const [usuarios, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        // Los pendientes primero: son los que exigen una decisión.
        orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
        skip: (page - 1) * perPage,
        take: perPage,
      }),
      this.prisma.user.count({ where }),
    ]);

    return {
      data: usuarios.map(aPerfilPublico),
      meta: { page, per_page: perPage, total },
    };
  }

  async aprobar(adminId: bigint, userId: bigint, contexto: Contexto): Promise<PerfilPublico> {
    const usuario = await this.exigirUsuario(userId);

    if (usuario.status === 'active') {
      throw new BadRequestException('Esa cuenta ya está activa.');
    }

    const actualizado = await this.prisma.user.update({
      where: { id: userId },
      data: { status: 'active', approvedAt: new Date(), approvedById: adminId },
    });

    await this.audit.registrar({
      userId: adminId,
      entity: 'users',
      entityId: userId,
      action: 'admin.user_approved',
      changes: { de: usuario.status, a: 'active' },
      ...contexto,
    });

    return aPerfilPublico(actualizado);
  }

  /**
   * Suspender corta el acceso AL INSTANTE: además de cambiar el estado, revoca
   * todas las sesiones. Sin eso, quien ya tuviera un access token seguiría
   * entrando hasta que expirara.
   */
  async suspender(adminId: bigint, userId: bigint, contexto: Contexto): Promise<PerfilPublico> {
    this.exigirQueNoSeaUnoMismo(adminId, userId, 'suspenderte a ti mismo');
    const usuario = await this.exigirUsuario(userId);
    await this.exigirQueQuedeAlgunAdmin(usuario.role, userId);

    const actualizado = await this.prisma.user.update({
      where: { id: userId },
      data: { status: 'suspended' },
    });
    await this.auth.revocarTodasLasSesiones(userId);

    await this.audit.registrar({
      userId: adminId,
      entity: 'users',
      entityId: userId,
      action: 'admin.user_suspended',
      changes: { de: usuario.status, a: 'suspended' },
      ...contexto,
    });

    return aPerfilPublico(actualizado);
  }

  async reactivar(adminId: bigint, userId: bigint, contexto: Contexto): Promise<PerfilPublico> {
    const usuario = await this.exigirUsuario(userId);

    const actualizado = await this.prisma.user.update({
      where: { id: userId },
      data: { status: 'active' },
    });

    await this.audit.registrar({
      userId: adminId,
      entity: 'users',
      entityId: userId,
      action: 'admin.user_reactivated',
      changes: { de: usuario.status, a: 'active' },
      ...contexto,
    });

    return aPerfilPublico(actualizado);
  }

  async cambiarRol(
    adminId: bigint,
    userId: bigint,
    rol: UserRole,
    contexto: Contexto,
  ): Promise<PerfilPublico> {
    this.exigirQueNoSeaUnoMismo(adminId, userId, 'cambiar tu propio rol');
    const usuario = await this.exigirUsuario(userId);

    if (usuario.role === 'admin' && rol === 'user') {
      await this.exigirQueQuedeAlgunAdmin(usuario.role, userId);
    }

    const actualizado = await this.prisma.user.update({
      where: { id: userId },
      data: { role: rol },
    });

    // El rol se lee de la base en cada petición, así que el cambio ya aplica.
    // Aun así se cierran las sesiones: un cambio de permisos merece que la
    // persona vuelva a entrar y vea su nuevo contexto desde cero.
    await this.auth.revocarTodasLasSesiones(userId);

    await this.audit.registrar({
      userId: adminId,
      entity: 'users',
      entityId: userId,
      action: 'admin.role_changed',
      changes: { de: usuario.role, a: rol },
      ...contexto,
    });

    return aPerfilPublico(actualizado);
  }

  /**
   * Restablece la contraseña de otra cuenta.
   *
   * Existe porque el envío de correos del plan gratuito no da para un
   * autoservicio de recuperación fiable: el administrador es el camino de
   * vuelta para quien olvide su clave.
   * Es una operación potente y por eso queda auditada, y cierra todas las
   * sesiones de esa persona.
   */
  async restablecerContrasena(
    adminId: bigint,
    userId: bigint,
    nueva: string,
    contexto: Contexto,
  ): Promise<void> {
    const usuario = await this.exigirUsuario(userId);

    await this.passwords.exigirQueSeaFuerte(nueva, {
      email: usuario.email,
      displayName: usuario.displayName ?? undefined,
    });

    // La contraseña la guarda Supabase; aquí no queda ni rastro de ella.
    if (!usuario.authId) {
      throw new UnprocessableEntityException(
        'Esta cuenta no tiene credenciales gestionadas y no se le puede restablecer la contraseña.',
      );
    }
    await this.supabase.cambiarContrasena(usuario.authId, nueva);
    await this.auth.revocarTodasLasSesiones(userId);

    await this.audit.registrar({
      userId: adminId,
      entity: 'users',
      entityId: userId,
      action: 'admin.password_reset',
      ...contexto,
    });
  }

  async bitacora(filtros: { page?: number | undefined; per_page?: number | undefined }) {
    const page = filtros.page ?? 1;
    const perPage = filtros.per_page ?? 50;

    const [eventos, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * perPage,
        take: perPage,
        include: { user: { select: { email: true, displayName: true } } },
      }),
      this.prisma.auditLog.count(),
    ]);

    return {
      data: eventos.map((evento) => ({
        id: evento.id,
        action: evento.action,
        entity: evento.entity,
        entity_id: evento.entityId,
        user: evento.user ? { email: evento.user.email, name: evento.user.displayName } : null,
        changes: evento.changesJson,
        ip: evento.ip,
        created_at: evento.createdAt,
      })),
      meta: { page, per_page: perPage, total },
    };
  }

  private async exigirUsuario(userId: bigint) {
    const usuario = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!usuario) throw new NotFoundException('El usuario no existe.');
    return usuario;
  }

  /** Evita que un admin se deje a sí mismo fuera por accidente. */
  private exigirQueNoSeaUnoMismo(adminId: bigint, userId: bigint, accion: string): void {
    if (adminId === userId) {
      throw new BadRequestException(`No puedes ${accion}.`);
    }
  }

  /** Impide quedarse sin ningún administrador y perder el panel para siempre. */
  private async exigirQueQuedeAlgunAdmin(rol: UserRole, userId: bigint): Promise<void> {
    if (rol !== 'admin') return;

    const otrosAdmins = await this.prisma.user.count({
      where: { role: 'admin', status: 'active', id: { not: userId } },
    });

    if (otrosAdmins === 0) {
      throw new BadRequestException(
        'Es el único administrador activo. Nombra otro antes de quitarle el acceso.',
      );
    }
  }
}

interface Contexto {
  ip?: string | null;
  userAgent?: string | null;
}

// ── Controlador ──────────────────────────────────────────────────────────────

/**
 * Panel de administración.
 *
 * `@Roles('admin')` a nivel de clase: todas las rutas quedan restringidas de
 * una, sin depender de que alguien se acuerde de anotarlas una por una.
 */
@Controller('admin')
@UseGuards(RolesGuard)
@Roles('admin')
export class AdminController {
  constructor(private readonly admin: AdminService) {}

  @Get('users')
  listar(@Query() query: ListUsersQueryDto) {
    return this.admin.listarUsuarios(query);
  }

  @Post('users/:id/approve')
  aprobar(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseBigIntPipe) id: bigint,
  ): Promise<PerfilPublico> {
    return this.admin.aprobar(user.id, id, {});
  }

  @Post('users/:id/suspend')
  suspender(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseBigIntPipe) id: bigint,
  ): Promise<PerfilPublico> {
    return this.admin.suspender(user.id, id, {});
  }

  @Post('users/:id/reactivate')
  reactivar(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseBigIntPipe) id: bigint,
  ): Promise<PerfilPublico> {
    return this.admin.reactivar(user.id, id, {});
  }

  @Post('users/:id/role')
  cambiarRol(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseBigIntPipe) id: bigint,
    @Body() dto: ChangeRoleDto,
  ): Promise<PerfilPublico> {
    return this.admin.cambiarRol(user.id, id, dto.role, {});
  }

  @Post('users/:id/reset-password')
  @HttpCode(HttpStatus.NO_CONTENT)
  restablecer(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseBigIntPipe) id: bigint,
    @Body() dto: ResetPasswordDto,
  ): Promise<void> {
    return this.admin.restablecerContrasena(user.id, id, dto.newPassword, {});
  }

  @Get('audit-log')
  // Llegan como texto de la URL: de ahí el `Number`.
  bitacora(@Query() query: { page?: string; per_page?: string }) {
    return this.admin.bitacora({
      page: query.page ? Number(query.page) : undefined,
      per_page: query.per_page ? Number(query.per_page) : undefined,
    });
  }
}

@Module({
  controllers: [AdminController],
  providers: [AdminService],
})
export class AdminModule {}
