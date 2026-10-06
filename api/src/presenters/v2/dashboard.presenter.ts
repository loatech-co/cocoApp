import { accountV2 } from './accounts.presenter';
import type { Dashboard } from '../../modules/dashboard/dashboard.types';

/** v2 body of the dashboard (see `transactions.presenter.ts`). */
export function dashboardV2(dashboard: Dashboard): Dashboard {
  return { ...dashboard, accounts: dashboard.accounts.map(accountV2) };
}
