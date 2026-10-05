import type { Prisma } from '@prisma/client';

import type { AccountResponse } from './accounts.response';
import type { AuditEntryResponse, AuditUserResponse } from './admin.response';
import type { MeResponse, ProfileResponse, SessionResponse } from './auth.response';
import type { CategoryMergeResponse, CategoryResponse } from './categories.response';
import type { SuggestionResponse } from './categorization.response';
import type { DashboardResponse } from './dashboard.response';
import type { LivenessResponse, ReadinessResponse } from './health.response';
import type { CaptureResponse, InterpretationResponse } from './interpretation.response';
import type { PreferencesResponse } from './preferences.response';
import type { SoporteResponse } from './soportes.response';
import type { TagResponse } from './tags.response';
import type { TransactionResponse, TransferResponse } from './transactions.response';
import type { AccountView } from '../../modules/accounts/accounts.service';
import type { AdminService } from '../../modules/admin/admin.service';
import type { RespuestaDeSesion } from '../../modules/auth/auth.controller';
import type { PerfilConFlags, PerfilPublico } from '../../modules/auth/auth.service';
import type { CategoryPayload } from '../../modules/categories/categories.controller';
import type { CategoriesService } from '../../modules/categories/categories.service';
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
import type { TransactionView } from '../../modules/transactions/transactions.service';

/**
 * The documented response shapes ARE the ones the services return.
 *
 * The OpenAPI document is built from the classes in this folder, but what the
 * client receives is built by the services from their own view types. If one
 * gains a field and the class does not, the document lies without any route
 * changing. These checks make that a compile error (`npm run typecheck`).
 *
 * `Wire<T>` is what `JSON.stringify` makes of a view: a bigint goes out as a
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

type AuditEntry = Awaited<ReturnType<AdminService['bitacora']>>['data'][number];
type MergeResult = Awaited<ReturnType<CategoriesService['unificar']>>;

const CHECKS = {
  account: true satisfies Same<AccountResponse, Wire<AccountView>>,
  auditEntry: true satisfies Same<
    Omit<AuditEntryResponse, 'changes' | 'user'>,
    Wire<Omit<AuditEntry, 'changes' | 'user'>>
  >,
  auditUser: true satisfies Same<AuditUserResponse | null, AuditEntry['user']>,
  auditChanges: true satisfies Same<Prisma.JsonValue, AuditEntry['changes']>,
  profile: true satisfies Same<ProfileResponse, Wire<PerfilPublico>>,
  me: true satisfies Same<MeResponse, Wire<PerfilConFlags>>,
  session: true satisfies Same<SessionResponse, Wire<RespuestaDeSesion>>,
  category: true satisfies Same<CategoryResponse, Wire<CategoryPayload>>,
  categoryMerge: true satisfies Same<CategoryMergeResponse, Wire<MergeResult>>,
  suggestion: true satisfies Same<SuggestionResponse, Wire<SugerenciaView>>,
  dashboard: true satisfies Same<DashboardResponse, Wire<DashboardPayload>>,
  liveness: true satisfies Same<LivenessResponse, LivenessPayload>,
  readiness: true satisfies Same<ReadinessResponse, ReadinessPayload>,
  interpretation: true satisfies Same<InterpretationResponse, Wire<InterpretacionView>>,
  capture: true satisfies Same<CaptureResponse, Wire<CapturaView>>,
  preferences: true satisfies Same<PreferencesResponse, Preferencias>,
  soporte: true satisfies Same<SoporteResponse, Wire<SoporteView>>,
  tag: true satisfies Same<TagResponse, Wire<TagView>>,
  transaction: true satisfies Same<TransactionResponse, Wire<TransactionView>>,
  transfer: true satisfies Same<
    TransferResponse,
    Wire<{ transfer_group_id: string; legs: TransactionView[] }>
  >,
};

describe('v1 response classes', () => {
  it('match the views the services return (checked by the compiler)', () => {
    expect(Object.values(CHECKS).every(Boolean)).toBe(true);
  });
});
