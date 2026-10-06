import { profileV1, type ProfileV1 } from './auth.presenter';
import type { AuditEntry, AuditPage, UserPage } from '../../modules/admin/admin.service';

export interface PageV1<T> {
  data: T[];
  meta: { page: number; per_page: number; total: number };
}

export interface AuditEntryV1 {
  id: bigint;
  action: string;
  entity: string;
  entity_id: bigint | null;
  user: AuditEntry['user'];
  changes: AuditEntry['changes'];
  ip: string | null;
  created_at: Date;
}

function auditEntryV1(e: AuditEntry): AuditEntryV1 {
  return {
    id: e.id,
    action: e.action,
    entity: e.entity,
    entity_id: e.entityId,
    user: e.user,
    changes: e.changes,
    ip: e.ip,
    created_at: e.createdAt,
  };
}

export function userPageV1(page: UserPage): PageV1<ProfileV1> {
  const { meta } = page;
  return {
    data: page.data.map(profileV1),
    meta: { page: meta.page, per_page: meta.perPage, total: meta.total },
  };
}

export function auditPageV1(page: AuditPage): PageV1<AuditEntryV1> {
  const { meta } = page;
  return {
    data: page.data.map(auditEntryV1),
    meta: { page: meta.page, per_page: meta.perPage, total: meta.total },
  };
}
