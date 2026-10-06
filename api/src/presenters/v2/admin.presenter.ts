import { profileV2 } from './auth.presenter';
import type { AuditPage, UserPage } from '../../modules/admin/admin.service';

/** v2 bodies of the administration lists (see `transactions.presenter.ts`). */

export function userPageV2(page: UserPage): UserPage {
  return { data: page.data.map(profileV2), meta: page.meta };
}

export function auditPageV2(page: AuditPage): AuditPage {
  return page;
}
