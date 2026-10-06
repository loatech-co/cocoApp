import { Injectable, Logger } from '@nestjs/common';

import { AuditRepository, type AuditEntryWithUser } from './audit.repository';
import type { Prisma } from '../../generated/prisma/client';

/** Acciones auditadas. Tipadas para que no se cuelen cadenas sueltas. */
type AuditedAction =
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

export interface AuditedEvent {
  /** NULL cuando el intento no corresponde a ningún usuario conocido. */
  userId?: bigint | null;
  entity: string;
  entityId?: bigint | null;
  action: AuditedAction;
  changes?: Prisma.InputJsonValue | undefined;
  ip?: string | null | undefined;
  userAgent?: string | null | undefined;
}

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly repository: AuditRepository) {}

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
  async record(event: AuditedEvent): Promise<void> {
    try {
      await this.repository.create({
        userId: event.userId ?? null,
        entity: event.entity,
        entityId: event.entityId ?? null,
        action: event.action,
        ...(event.changes !== undefined && { changesJson: event.changes }),
        ip: event.ip ?? null,
        userAgent: event.userAgent?.slice(0, 255) ?? null,
      });
    } catch (error) {
      this.logger.error(
        `No se pudo auditar ${event.action}`,
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  /** One page of the log, newest first, with its total. */
  page(
    adminId: bigint,
    skip: number,
    take: number,
  ): Promise<{ entries: AuditEntryWithUser[]; total: number }> {
    return this.repository.findPage(adminId, skip, take);
  }
}
