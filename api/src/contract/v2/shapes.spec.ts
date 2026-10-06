import type { Account } from './accounts.response';
import type { AuditEntry, AuditUser, Me, Profile, Registration, Session } from './auth.response';
import type {
  Category,
  CategoryMerge,
  CategoryNode,
  CategorySeed,
  CategoryUsage,
} from './categories.response';
import type { Learning, Suggestion } from './categorization.response';
import type { Dashboard } from './dashboard.response';
import type { Capture, Interpretation } from './interpretation.response';
import type { Liveness, Preferences, Readiness, Receipt, Tag } from './misc.response';
import type {
  Transaction,
  TransactionHistory,
  TransactionPageMeta,
  Transfer,
} from './transactions.response';
import type { Account as AccountDomain } from '../../modules/accounts/accounts.service';
import type { AuditPage } from '../../modules/admin/admin.service';
import type { Profile as ProfileDomain } from '../../modules/auth/auth.service';
import type * as categories from '../../modules/categories/categories.domain';
import type * as categorization from '../../modules/categorization/categorization.service';
import type { Dashboard as DashboardDomain } from '../../modules/dashboard/dashboard.types';
import type { LivenessPayload, ReadinessPayload } from '../../modules/health/health.service';
import type * as interpretation from '../../modules/interpretation/interpretation.domain';
import type { Preferences as PreferencesDomain } from '../../modules/preferences/preferences';
import type { Receipt as ReceiptDomain } from '../../modules/receipts/receipts.service';
import type { Tag as TagDomain } from '../../modules/tags/tags.service';
import type * as transactions from '../../modules/transactions/transactions.domain';
import type { meV2, SessionV2 } from '../../presenters/v2/auth.presenter';

/**
 * The documented v2 shapes ARE the ones the v2 presenters hand out.
 *
 * The same check as `contract/v1/shapes.spec.ts`, for v2: what goes over the
 * wire is the domain the service returns, through `presenters/v2`. A field
 * the domain gains and this class does not document — or one v2 should not
 * show and the presenter forgot to drop — is a compile error.
 *
 * `Wire<T>` is what `JSON.stringify` makes of a body: a bigint goes out as a
 * number (`installBigIntSerializer`).
 */
type Wire<T> = T extends bigint
  ? number
  : T extends Date
    ? Date
    : T extends readonly (infer U)[]
      ? Wire<U>[]
      : T extends object
        ? { [K in keyof T]: Wire<T[K]> }
        : T;

type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;

type AuditEntryDomain = AuditPage['data'][number];

const CHECKS = {
  account: true satisfies Same<Account, Wire<AccountDomain>>,
  auditEntry: true satisfies Same<
    Omit<AuditEntry, 'changes' | 'user'>,
    Wire<Omit<AuditEntryDomain, 'changes' | 'user'>>
  >,
  auditUser: true satisfies Same<AuditUser | null, AuditEntryDomain['user']>,
  profile: true satisfies Same<Profile, Wire<ProfileDomain>>,
  me: true satisfies Same<Me, Wire<ReturnType<typeof meV2>>>,
  session: true satisfies Same<Session, Wire<SessionV2>>,
  registration: true satisfies Same<Registration, { pendingApproval: boolean; message: string }>,
  category: true satisfies Same<Category, Wire<categories.Category>>,
  categoryNode: true satisfies Same<CategoryNode, Wire<categories.CategoryNode>>,
  categoryMerge: true satisfies Same<CategoryMerge, Wire<categories.CategoryMerge>>,
  categoryUsage: true satisfies Same<CategoryUsage, categories.CategoryUsage>,
  categorySeed: true satisfies Same<CategorySeed, categories.CategorySeed>,
  suggestion: true satisfies Same<Suggestion, categorization.Suggestion>,
  learning: true satisfies Same<Learning, categorization.Learning>,
  dashboard: true satisfies Same<Dashboard, Wire<DashboardDomain>>,
  liveness: true satisfies Same<Liveness, LivenessPayload>,
  readiness: true satisfies Same<Readiness, ReadinessPayload>,
  interpretation: true satisfies Same<Interpretation, Wire<interpretation.Interpretation>>,
  capture: true satisfies Same<Capture, Wire<interpretation.Capture>>,
  preferences: true satisfies Same<Preferences, PreferencesDomain>,
  receipt: true satisfies Same<Receipt, Wire<ReceiptDomain>>,
  tag: true satisfies Same<Tag, Wire<TagDomain>>,
  transaction: true satisfies Same<Transaction, Wire<transactions.Transaction>>,
  history: true satisfies Same<TransactionHistory, transactions.TransactionHistory>,
  transactionPageMeta: true satisfies Same<
    TransactionPageMeta,
    transactions.TransactionPage['meta']
  >,
  transfer: true satisfies Same<Transfer, Wire<transactions.Transfer>>,
};

describe('v2 response classes', () => {
  it('match what the v2 presenters hand out (checked by the compiler)', () => {
    expect(Object.values(CHECKS).every(Boolean)).toBe(true);
  });
});
