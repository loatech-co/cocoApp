import { Injectable, Logger } from '@nestjs/common';

import { AuditRepository, type AuditEntryWithUser } from './audit.repository';
import type { Prisma } from '../../generated/prisma/client';

/** Audited actions. Typed so loose strings cannot slip in. */
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
  /** NULL when the attempt matches no known user. */
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
   * Records an event.
   *
   * It NEVER throws: if auditing fails, the user's operation must go on. An
   * error writing the audit log cannot turn into a business error — but it
   * does stay in the server log so it does not go unnoticed.
   *
   * What is NOT stored here: passwords, tokens, amounts or transaction
   * descriptions. The audit log says "which entity and which operation", not
   * "how much money".
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
