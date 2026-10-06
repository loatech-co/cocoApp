import type { AccountResponse } from './accounts.response';
import type { AuditEntryResponse, AuditUserResponse } from './admin.response';
import type { MeResponse, ProfileResponse, SessionResponse } from './auth.response';
import type {
  CategoryMergeResponse,
  CategoryResponse,
  CategorySeedResponse,
  CategoryUsageResponse,
} from './categories.response';
import type { LearnResponse, SuggestionResponse } from './categorization.response';
import type { DashboardResponse } from './dashboard.response';
import type { LivenessResponse, ReadinessResponse } from './health.response';
import type { CaptureResponse, InterpretationResponse } from './interpretation.response';
import type { PreferencesResponse } from './preferences.response';
import type { SoporteResponse } from './soportes.response';
import type { TagResponse } from './tags.response';
import type {
  TransactionHistoryResponse,
  TransactionResponse,
  TransferResponse,
} from './transactions.response';
import type { Prisma } from '../../generated/prisma/client';
import type { LivenessPayload, ReadinessPayload } from '../../modules/health/health.service';
import type { Tag } from '../../modules/tags/tags.service';
import type { TransactionHistory } from '../../modules/transactions/transactions.domain';
import type { AccountV1 } from '../../presenters/v1/accounts.presenter';
import type { AuditEntryV1 } from '../../presenters/v1/admin.presenter';
import type { MeV1, ProfileV1, SessionV1 } from '../../presenters/v1/auth.presenter';
import type {
  categoryMergeV1,
  categorySeedV1,
  categoryUsageV1,
  CategoryV1,
} from '../../presenters/v1/categories.presenter';
import type { LearningV1, SuggestionV1 } from '../../presenters/v1/categorization.presenter';
import type { DashboardV1 } from '../../presenters/v1/dashboard.presenter';
import type { CaptureV1, InterpretationV1 } from '../../presenters/v1/interpretation.presenter';
import type { PreferencesV1 } from '../../presenters/v1/preferences.presenter';
import type { ReceiptV1 } from '../../presenters/v1/receipts.presenter';
import type { TransactionV1, TransferV1 } from '../../presenters/v1/transactions.presenter';

/**
 * The documented v1 shapes ARE the ones the v1 presenters build.
 *
 * The OpenAPI document is built from the classes in this folder, but what the
 * client receives is built by `presenters/v1` from the domain. If one gains a
 * field and the class does not, the document lies without any route
 * changing. These checks make that a compile error (`npm run typecheck`).
 *
 * `Wire<T>` is what `JSON.stringify` makes of a body: a bigint goes out as a
 * number (`installBigIntSerializer`). A Date stays a Date here because the
 * class declares it as one and the plugin documents it as `date-time`.
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

/** Mutual assignability: a missing, extra or retyped field fails either way. */
type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;

const CHECKS = {
  account: true satisfies Same<AccountResponse, Wire<AccountV1>>,
  auditEntry: true satisfies Same<
    Omit<AuditEntryResponse, 'changes' | 'user'>,
    Wire<Omit<AuditEntryV1, 'changes' | 'user'>>
  >,
  auditUser: true satisfies Same<AuditUserResponse | null, AuditEntryV1['user']>,
  auditChanges: true satisfies Same<Prisma.JsonValue, AuditEntryV1['changes']>,
  profile: true satisfies Same<ProfileResponse, Wire<ProfileV1>>,
  me: true satisfies Same<MeResponse, Wire<MeV1>>,
  session: true satisfies Same<SessionResponse, Wire<SessionV1>>,
  category: true satisfies Same<CategoryResponse, Wire<CategoryV1>>,
  categoryMerge: true satisfies Same<
    CategoryMergeResponse,
    Wire<ReturnType<typeof categoryMergeV1>>
  >,
  categoryUsage: true satisfies Same<
    CategoryUsageResponse,
    Wire<ReturnType<typeof categoryUsageV1>>
  >,
  categorySeed: true satisfies Same<CategorySeedResponse, ReturnType<typeof categorySeedV1>>,
  suggestion: true satisfies Same<SuggestionResponse, Wire<SuggestionV1>>,
  learning: true satisfies Same<LearnResponse, LearningV1>,
  dashboard: true satisfies Same<DashboardResponse, Wire<DashboardV1>>,
  liveness: true satisfies Same<LivenessResponse, LivenessPayload>,
  readiness: true satisfies Same<ReadinessResponse, ReadinessPayload>,
  interpretation: true satisfies Same<InterpretationResponse, Wire<InterpretationV1>>,
  capture: true satisfies Same<CaptureResponse, Wire<CaptureV1>>,
  preferences: true satisfies Same<PreferencesResponse, PreferencesV1>,
  soporte: true satisfies Same<SoporteResponse, Wire<ReceiptV1>>,
  tag: true satisfies Same<TagResponse, Wire<Tag>>,
  transaction: true satisfies Same<TransactionResponse, Wire<TransactionV1>>,
  history: true satisfies Same<TransactionHistoryResponse, TransactionHistory>,
  transfer: true satisfies Same<TransferResponse, Wire<TransferV1>>,
};

describe('v1 response classes', () => {
  it('match what the v1 presenters build (checked by the compiler)', () => {
    expect(Object.values(CHECKS).every(Boolean)).toBe(true);
  });
});
