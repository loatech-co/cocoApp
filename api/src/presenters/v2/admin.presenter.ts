import { profileV2 } from './auth.presenter';
import type { Prisma } from '../../generated/prisma/client';
import type { AuditPage, UserPage } from '../../modules/admin/admin.service';

/** v2 bodies of the administration lists (see `transactions.presenter.ts`). */

export function userPageV2(page: UserPage): UserPage {
  return { data: page.data.map(profileV2), meta: page.meta };
}

/**
 * Entries recorded before the English rename carry `de`/`a`/`motivo`. The
 * stored rows are not rewritten (see plan 8.7), so both shapes are read here.
 */
const LEGACY_CHANGE_KEYS: ReadonlyMap<string, string> = new Map([
  ['de', 'from'],
  ['a', 'to'],
  ['motivo', 'reason'],
]);

const LEGACY_REASONS: ReadonlyMap<string, string> = new Map([
  ['credenciales_incorrectas', 'invalid_credentials'],
]);

/** The changes of an audit entry in the current shape, whichever shape they were recorded in. */
export function auditChangesV2(changes: Prisma.JsonValue): Prisma.JsonValue {
  if (changes === null || typeof changes !== 'object' || Array.isArray(changes)) return changes;

  const current: Record<string, Prisma.JsonValue> = {};
  for (const [key, value] of Object.entries(changes)) {
    const currentName = LEGACY_CHANGE_KEYS.get(key);
    // A current key always wins over its legacy twin.
    if (currentName !== undefined && currentName in changes) continue;
    current[currentName ?? key] = value ?? null;
  }

  const reason = current.reason;
  if (typeof reason === 'string') current.reason = LEGACY_REASONS.get(reason) ?? reason;
  return current;
}

export function auditPageV2(page: AuditPage): AuditPage {
  return {
    data: page.data.map((entry) => ({ ...entry, changes: auditChangesV2(entry.changes) })),
    meta: page.meta,
  };
}
