import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useState } from 'react';

import { CabeceraDePagina } from '@/components/cabecera-de-pagina';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import type { AuditAction, AuditEntry } from '@coco/types';

import { useBitacora } from './admin-queries';

/** Cada acción auditada, en español y sin jerga. */
const ETIQUETAS: Record<AuditAction, string> = {
  'auth.register': 'Solicitó acceso',
  'auth.login': 'Entró',
  'auth.login_failed': 'Intento de acceso fallido',
  'auth.logout': 'Cerró sesión',
  'auth.logout_all': 'Cerró sesión en todos los dispositivos',
  'auth.token_reuse_detected': 'Reuso de token detectado',
  'auth.password_changed': 'Cambió su contraseña',
  'admin.user_approved': 'Aprobó una cuenta',
  'admin.user_rejected': 'Rechazó una cuenta',
  'admin.user_suspended': 'Suspendió una cuenta',
  'admin.user_reactivated': 'Reactivó una cuenta',
  'admin.password_reset': 'Restableció una contraseña',
  'admin.role_changed': 'Cambió un rol',
};

/** Las que merecen destacarse a simple vista. */
const PREOCUPANTES = new Set<AuditAction>(['auth.login_failed', 'auth.token_reuse_detected']);

const formatoDeFecha = new Intl.DateTimeFormat('es-CO', {
  dateStyle: 'medium',
  timeStyle: 'short',
});

/**
 * Bitácora de seguridad.
 *
 * Qué NO aparece aquí, a propósito: contraseñas, tokens, montos ni
 * descripciones de movimientos. La bitácora responde "quién hizo qué y cuándo",
 * no "cuánto dinero". Si guardara lo segundo, filtrarla sería mucho más caro.
 */
export function BitacoraPage() {
  const [pagina, setPagina] = useState(1);
  const consulta = useBitacora(pagina);

  const total = consulta.data?.meta.total ?? 0;
  const porPagina = consulta.data?.meta.per_page ?? 50;
  const ultimaPagina = Math.max(Math.ceil(total / porPagina), 1);

  return (
    <div className="flex flex-col gap-6">
      <CabeceraDePagina
        titulo="Bitácora"
        ayuda="Quién hizo qué y cuándo. Nunca registra montos ni contraseñas."
      />

      {consulta.isPending && (
        <div className="flex flex-col gap-2">
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-14 w-full" />
        </div>
      )}

      {consulta.isError && (
        <Alert variant="destructive">
          <AlertDescription>No se pudo cargar la bitácora.</AlertDescription>
        </Alert>
      )}

      {consulta.data?.data.length === 0 && (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            Todavía no hay eventos registrados.
          </CardContent>
        </Card>
      )}

      {consulta.data && consulta.data.data.length > 0 && (
        <>
          <ul className="flex flex-col gap-2">
            {consulta.data.data.map((evento) => (
              <Evento key={evento.id} evento={evento} />
            ))}
          </ul>

          <nav className="flex items-center justify-between" aria-label="Paginación">
            <Button
              variant="outline"
              size="sm"
              disabled={pagina <= 1}
              onClick={() => setPagina((p) => p - 1)}
            >
              <ChevronLeft aria-hidden="true" />
              Anterior
            </Button>
            <span className="text-sm text-muted-foreground">
              Página {pagina} de {ultimaPagina}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={pagina >= ultimaPagina}
              onClick={() => setPagina((p) => p + 1)}
            >
              Siguiente
              <ChevronRight aria-hidden="true" />
            </Button>
          </nav>
        </>
      )}
    </div>
  );
}

function Evento({ evento }: { evento: AuditEntry }) {
  const preocupante = PREOCUPANTES.has(evento.action);

  return (
    <li>
      <Card>
        <CardContent className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-3">
          <div className="min-w-0">
            <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
              {/* Una API más nueva puede traer una acción que esta lista aún no conoce. */}
              {Object.hasOwn(ETIQUETAS, evento.action) ? ETIQUETAS[evento.action] : evento.action}
              {preocupante && (
                <Badge variant="warning" className="font-normal">
                  Revisar
                </Badge>
              )}
            </p>
            <p className="truncate text-xs text-muted-foreground">
              {evento.user ? (evento.user.name ?? evento.user.email) : 'Cuenta desconocida'}
              {evento.ip && ` · ${evento.ip}`}
            </p>
          </div>
          <time
            dateTime={evento.created_at}
            className="shrink-0 text-xs tabular-nums text-muted-foreground"
          >
            {formatoDeFecha.format(new Date(evento.created_at))}
          </time>
        </CardContent>
      </Card>
    </li>
  );
}
