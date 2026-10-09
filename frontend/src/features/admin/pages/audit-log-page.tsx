import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useState, type Dispatch, type SetStateAction } from 'react';

import { useAuditLog } from '@/features/admin/api/admin-queries';
import type { AuditEntry } from '@/shared/api/generated/model';
import { dateTime } from '@/shared/lib/format';
import { t } from '@/shared/lib/i18n';
import { Alert, AlertDescription } from '@/shared/ui/atoms/alert';
import { Badge } from '@/shared/ui/atoms/badge';
import { Button } from '@/shared/ui/atoms/button';
import { Card, CardContent } from '@/shared/ui/atoms/card';
import { PageHeader } from '@/shared/ui/atoms/page-header';
import { Skeleton } from '@/shared/ui/atoms/skeleton';

/**
 * Actions the audit log records. Mirror of `AccionAuditada` in the API: the
 * v2 document types `action` as a plain string, so an action this list does
 * not know yet is shown as it comes.
 */
type AuditAction =
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

const isKnown = (action: string): action is AuditAction => Object.hasOwn(LABELS, action);

/** Cada acción auditada, en español y sin jerga. */
const LABELS: Record<AuditAction, string> = {
  'auth.register': t('admin.auditLog.actions.register'),
  'auth.login': t('admin.auditLog.actions.login'),
  'auth.login_failed': t('admin.auditLog.actions.loginFailed'),
  'auth.logout': t('admin.auditLog.actions.logout'),
  'auth.logout_all': t('admin.auditLog.actions.logoutAll'),
  'auth.token_reuse_detected': t('admin.auditLog.actions.tokenReuse'),
  'auth.password_changed': t('admin.auditLog.actions.passwordChanged'),
  'admin.user_approved': t('admin.auditLog.actions.userApproved'),
  'admin.user_rejected': t('admin.auditLog.actions.userRejected'),
  'admin.user_suspended': t('admin.auditLog.actions.userSuspended'),
  'admin.user_reactivated': t('admin.auditLog.actions.userReactivated'),
  'admin.password_reset': t('admin.auditLog.actions.passwordReset'),
  'admin.role_changed': t('admin.auditLog.actions.roleChanged'),
};

/** Las que merecen destacarse a simple vista. */
const WORRYING = new Set<AuditAction>(['auth.login_failed', 'auth.token_reuse_detected']);

/**
 * Bitácora de seguridad.
 *
 * Qué NO aparece aquí, a propósito: contraseñas, tokens, montos ni
 * descripciones de movimientos. La bitácora responde "quién hizo qué y cuándo",
 * no "cuánto dinero". Si guardara lo segundo, filtrarla sería mucho más caro.
 */
export function AuditLogPage() {
  const [page, setPage] = useState(1);
  const query = useAuditLog(page);

  const total = query.data?.meta.total ?? 0;
  const perPage = query.data?.meta.perPage ?? 50;
  const lastPage = Math.max(Math.ceil(total / perPage), 1);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t('shell.sections.auditLog')} description={t('admin.auditLog.help')} />

      {query.isPending && (
        <div className="flex flex-col gap-2">
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-14 w-full" />
        </div>
      )}

      {query.isError && (
        <Alert variant="destructive">
          <AlertDescription>{t('admin.auditLog.loadFailed')}</AlertDescription>
        </Alert>
      )}

      {query.data?.data.length === 0 && (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            {t('admin.auditLog.empty')}
          </CardContent>
        </Card>
      )}

      {query.data && query.data.data.length > 0 && (
        <>
          <ul className="flex flex-col gap-2">
            {query.data.data.map((event) => (
              <AuditEvent key={event.id} event={event} />
            ))}
          </ul>

          <LogPager page={page} lastPage={lastPage} setPage={setPage} />
        </>
      )}
    </div>
  );
}

function AuditEvent({ event }: { event: AuditEntry }) {
  const isWorrying = isKnown(event.action) && WORRYING.has(event.action);

  return (
    <li>
      <Card>
        <CardContent className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-3">
          <div className="min-w-0">
            <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
              {/* Una API más nueva puede traer una acción que esta lista aún no conoce. */}
              {isKnown(event.action) ? LABELS[event.action] : event.action}
              {isWorrying && (
                <Badge variant="warning" className="font-normal">
                  {t('admin.auditLog.review')}
                </Badge>
              )}
            </p>
            <p className="truncate text-xs text-muted-foreground">
              {event.user
                ? (event.user.name ?? event.user.email)
                : t('admin.auditLog.unknownAccount')}
              {event.ip && ` · ${event.ip}`}
            </p>
          </div>
          <time
            dateTime={event.createdAt}
            className="shrink-0 text-xs tabular-nums text-muted-foreground"
          >
            {dateTime.format(new Date(event.createdAt))}
          </time>
        </CardContent>
      </Card>
    </li>
  );
}

function LogPager({
  page,
  lastPage,
  setPage,
}: {
  page: number;
  lastPage: number;
  setPage: Dispatch<SetStateAction<number>>;
}) {
  return (
    <nav className="flex items-center justify-between" aria-label={t('common.pagination')}>
      <Button
        variant="outline"
        size="sm"
        disabled={page <= 1}
        onClick={() => setPage((p) => p - 1)}
      >
        <ChevronLeft aria-hidden="true" />
        {t('common.previous')}
      </Button>
      <span className="text-sm text-muted-foreground">
        {t('admin.auditLog.page', { page, pages: lastPage })}
      </span>
      <Button
        variant="outline"
        size="sm"
        disabled={page >= lastPage}
        onClick={() => setPage((p) => p + 1)}
      >
        {t('common.next')}
        <ChevronRight aria-hidden="true" />
      </Button>
    </nav>
  );
}
