import type { Account } from './accounts.response';
import type { AuditEntry, AuditUser, Profile, Registration, Session } from './auth.response';
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
import type { ToV2 } from './to-v2';
import type { Transaction, TransactionHistory, Transfer } from './transactions.response';
import type { ConHijos } from '../../common/categories/categories.tree';
import type { AccountView } from '../../modules/accounts/accounts.service';
import type { AdminService } from '../../modules/admin/admin.service';
import type { RespuestaDeSesion } from '../../modules/auth/auth.controller';
import type { PerfilPublico } from '../../modules/auth/auth.service';
import type { CategoriesService, CategoryView } from '../../modules/categories/categories.service';
import type { SugerenciaView } from '../../modules/categorization/categorization.service';
import type { DashboardPayload } from '../../modules/dashboard/dashboard.types';
import type { LivenessPayload, ReadinessPayload } from '../../modules/health/health.service';
import type {
  CapturaView,
  InterpretacionView,
} from '../../modules/interpretacion/interpretation.view';
import type { Preferencias } from '../../modules/preferences/preferences';
import type { SoporteView } from '../../modules/soportes/soportes.service';
import type { TagView } from '../../modules/tags/tags.service';
import type {
  TransactionView,
  TransactionsService,
} from '../../modules/transactions/transactions.service';

/**
 * The v2 classes ARE what `toV2` makes of the service views.
 *
 * The same check as `contract/v1/shapes.spec.ts`, one step further: the view
 * goes through `ToV2` (the compiler's copy of the runtime translation) and
 * then over the wire. A field the table forgets to rename, or a class that
 * drifts from its view, is a compile error.
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

type V2<T> = Wire<ToV2<T>>;

type AuditEntryView = Awaited<ReturnType<AdminService['bitacora']>>['data'][number];
type MergeView = Awaited<ReturnType<CategoriesService['unificar']>>;
type UsageView = Awaited<ReturnType<CategoriesService['usosDe']>>;
type SeedView = Awaited<ReturnType<CategoriesService['sembrarDiccionario']>>;
type HistoryView = Awaited<ReturnType<TransactionsService['historia']>>;

const CHECKS = {
  account: true satisfies Same<Account, V2<AccountView>>,
  auditEntry: true satisfies Same<
    Omit<AuditEntry, 'changes' | 'user'>,
    V2<Omit<AuditEntryView, 'changes' | 'user'>>
  >,
  auditUser: true satisfies Same<AuditUser | null, V2<AuditEntryView['user']>>,
  profile: true satisfies Same<Profile, V2<PerfilPublico>>,
  session: true satisfies Same<Session, V2<RespuestaDeSesion>>,
  registration: true satisfies Same<
    Registration,
    V2<{ pending_approval: boolean; message: string }>
  >,
  category: true satisfies Same<Category, V2<CategoryView>>,
  categoryNode: true satisfies Same<CategoryNode, V2<ConHijos<CategoryView>>>,
  categoryMerge: true satisfies Same<CategoryMerge, V2<MergeView>>,
  categoryUsage: true satisfies Same<CategoryUsage, V2<UsageView>>,
  categorySeed: true satisfies Same<CategorySeed, V2<SeedView>>,
  suggestion: true satisfies Same<Suggestion, V2<SugerenciaView>>,
  learning: true satisfies Same<Learning, V2<{ aprendido: boolean }>>,
  dashboard: true satisfies Same<Dashboard, V2<DashboardPayload>>,
  liveness: true satisfies Same<Liveness, V2<LivenessPayload>>,
  readiness: true satisfies Same<Readiness, V2<ReadinessPayload>>,
  interpretation: true satisfies Same<Interpretation, V2<InterpretacionView>>,
  capture: true satisfies Same<Capture, V2<CapturaView>>,
  preferences: true satisfies Same<Preferences, V2<Preferencias>>,
  receipt: true satisfies Same<Receipt, V2<SoporteView>>,
  tag: true satisfies Same<Tag, V2<TagView>>,
  transaction: true satisfies Same<Transaction, V2<TransactionView>>,
  history: true satisfies Same<TransactionHistory, V2<HistoryView>>,
  transfer: true satisfies Same<
    Transfer,
    V2<{ transfer_group_id: string; legs: TransactionView[] }>
  >,
};

describe('v2 response classes', () => {
  it('match what toV2 makes of the views the services return (checked by the compiler)', () => {
    expect(Object.values(CHECKS).every(Boolean)).toBe(true);
  });
});
