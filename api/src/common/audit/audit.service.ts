import { Injectable, Logger } from '@nestjs/common';
import type { Prisma } from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service';

/** Acciones auditadas. Tipadas para que no se cuelen cadenas sueltas. */
export type AccionAuditada =
  | 'auth.register'
  | 'auth.login'
  | 'auth.login_failed'
  | 'auth.logout'
  | 'auth.logout_all'
  | 'auth.token_reuse_detected'
  | 'auth.password_changed'
  | 'admin.user_approved'
  | 'admin.user_rejected'
  | 'admin.user_suspended'
  | 'admin.user_reactivated'
  | 'admin.password_reset'
  | 'admin.role_changed';

export interface EventoAuditado {
  /** NULL cuando el intento no corresponde a ningún usuario conocido. */
  userId?: bigint | null;
  entity: string;
  entityId?: bigint | null;
  action: AccionAuditada;
  changes?: Prisma.InputJsonValue | undefined;
  ip?: string | null | undefined;
  userAgent?: string | null | undefined;
}

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Registra un evento.
   *
   * NUNCA lanza: si la auditoría falla, la operación del usuario debe seguir su
   * curso. Un error escribiendo la bitácora no puede convertirse en un error de
   * negocio — pero sí queda en el log del servidor para que no pase inadvertido.
   *
   * Qué NO se guarda aquí: contraseñas, tokens, montos ni descripciones de
   * movimientos. La bitácora dice "qué entidad y qué operación", no "cuánto
   * dinero".
   */
  async registrar(evento: EventoAuditado): Promise<void> {
    try {
      await this.prisma.auditLog.create({
        data: {
          userId: evento.userId ?? null,
          entity: evento.entity,
          entityId: evento.entityId ?? null,
          action: evento.action,
          ...(evento.changes !== undefined && { changesJson: evento.changes }),
          ip: evento.ip ?? null,
          userAgent: evento.userAgent?.slice(0, 255) ?? null,
        },
      });
    } catch (error) {
      this.logger.error(
        `No se pudo auditar ${evento.action}`,
        error instanceof Error ? error.stack : String(error),
      );
    }
  }
}
