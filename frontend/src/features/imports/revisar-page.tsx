import type { Category, ImportRow, ImportRowStatus } from '@coco/types';
import {
  AlertCircle,
  ArrowDownLeft,
  ArrowUpRight,
  Check,
  CopyCheck,
  Loader2,
  Sparkles,
  Undo2,
  X,
} from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { ApiClientError } from '@/lib/api-client';
import { useCategories } from '@/lib/queries';
import { cn } from '@/lib/utils';
import {
  useConfirmarLote,
  useDescartarLote,
  useDeshacerLote,
  useEditarFila,
  useLote,
} from './imports-queries';

/**
 * Revisión antes de confirmar.
 *
 * Este paso no es opcional ni se puede saltar. Un OCR se equivoca, y un
 * movimiento equivocado que entra sin mirar contamina saldos e informes durante
 * meses — y para cuando se nota, ya nadie recuerda de dónde salió.
 */
export function RevisarPage() {
  const { id } = useParams<{ id: string }>();
  const loteId = Number(id);
  const navegar = useNavigate();

  const lote = useLote(Number.isFinite(loteId) ? loteId : null);
  const categorias = useCategories();
  const confirmar = useConfirmarLote();
  const deshacer = useDeshacerLote();
  const descartar = useDescartarLote();

  const [confirmado, setConfirmado] = useState<number | null>(null);

  if (lote.isPending) {
    return (
      <div className="flex flex-col gap-3">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-20 w-full" />
      </div>
    );
  }

  if (lote.isError || !lote.data) {
    return (
      <Alert variant="destructive">
        <AlertCircle aria-hidden="true" />
        <AlertTitle>No se encontró esa importación</AlertTitle>
        <AlertDescription>
          <Link to="/importar" className="underline underline-offset-4">
            Volver a importar
          </Link>
        </AlertDescription>
      </Alert>
    );
  }

  const { counts, status, rows = [] } = lote.data;
  const errorAlConfirmar =
    confirmar.error instanceof ApiClientError ? confirmar.error.message : null;

  if (confirmado !== null) {
    return (
      <div className="flex flex-col gap-4">
        <Alert variant="info">
          <Check aria-hidden="true" />
          <AlertTitle>
            {confirmado} {confirmado === 1 ? 'movimiento importado' : 'movimientos importados'}
          </AlertTitle>
          <AlertDescription>
            Ya están en tus cuentas y los saldos se actualizaron. Si algo salió mal, puedes
            deshacer la importación entera.
          </AlertDescription>
        </Alert>

        <div className="flex flex-wrap gap-2">
          <Button onClick={() => navegar('/movimientos')}>Ver los movimientos</Button>
          <Button
            variant="outline"
            disabled={deshacer.isPending}
            onClick={() =>
              deshacer.mutate(loteId, { onSuccess: () => navegar('/importar') })
            }
          >
            {deshacer.isPending ? (
              <Loader2 className="animate-spin" aria-hidden="true" />
            ) : (
              <Undo2 aria-hidden="true" />
            )}
            Deshacer la importación
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="font-serif text-3xl font-semibold">Revisar antes de importar</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {lote.data.label ?? 'Documento sin nombre'} · Nada de esto ha tocado tus finanzas
          todavía.
        </p>
      </header>

      <div className="flex flex-wrap gap-2">
        <Badge variant="income">
          <Check aria-hidden="true" />
          {counts.accepted} se importarán
        </Badge>
        {counts.duplicate > 0 && (
          <Badge variant="warning">
            <CopyCheck aria-hidden="true" />
            {counts.duplicate} posibles repetidos
          </Badge>
        )}
        {counts.skipped > 0 && (
          <Badge variant="outline">
            <X aria-hidden="true" />
            {counts.skipped} descartados
          </Badge>
        )}
      </div>

      {counts.duplicate > 0 && (
        <Alert variant="warning">
          <CopyCheck aria-hidden="true" />
          <AlertTitle>Hay movimientos que se parecen a otros que ya tienes</AlertTitle>
          <AlertDescription>
            Están marcados y quedarán fuera salvo que los aceptes. Ojo: dos compras iguales el
            mismo día en el mismo sitio son dos movimientos reales — decide tú.
          </AlertDescription>
        </Alert>
      )}

      {errorAlConfirmar && (
        <Alert variant="destructive">
          <AlertCircle aria-hidden="true" />
          <AlertDescription>{errorAlConfirmar}</AlertDescription>
        </Alert>
      )}

      <ul className="flex flex-col gap-2">
        {rows.map((fila) => (
          <Fila
            key={fila.id}
            fila={fila}
            loteId={loteId}
            categorias={categorias.data ?? []}
            editable={status === 'draft'}
          />
        ))}
      </ul>

      {status === 'draft' && (
        <div className="sticky bottom-20 flex flex-wrap gap-2 rounded-lg border border-border bg-card p-4 shadow-lg md:bottom-4">
          <Button
            disabled={counts.accepted === 0 || confirmar.isPending}
            onClick={() =>
              confirmar.mutate(loteId, {
                onSuccess: (resultado) => setConfirmado(resultado.creados),
              })
            }
          >
            {confirmar.isPending && <Loader2 className="animate-spin" aria-hidden="true" />}
            Importar {counts.accepted}{' '}
            {counts.accepted === 1 ? 'movimiento' : 'movimientos'}
          </Button>

          {/* Rojo: descartar borra el lote entero y no se puede recuperar. */}
          <Button
            variant="destructive"
            disabled={descartar.isPending}
            onClick={() => descartar.mutate(loteId, { onSuccess: () => navegar('/importar') })}
          >
            Descartar todo
          </Button>
        </div>
      )}
    </div>
  );
}

const formatoDeMoneda = new Intl.NumberFormat('es-CO', {
  style: 'currency',
  currency: 'COP',
  minimumFractionDigits: 2,
});

function Fila({
  fila,
  loteId,
  categorias,
  editable,
}: {
  fila: ImportRow;
  loteId: number;
  categorias: Category[];
  editable: boolean;
}) {
  const editar = useEditarFila(loteId);
  const [descripcion, setDescripcion] = useState(fila.description ?? '');

  const descartada = fila.status === 'skipped';
  const sospechosa = fila.status === 'duplicate';
  const esIngreso = fila.type === 'income';

  const cambiar = (cambios: Parameters<typeof editar.mutate>[0]['cambios']) =>
    editar.mutate({ rowId: fila.id, cambios });

  return (
    <li>
      <Card className={cn(descartada && 'opacity-50')}>
        <CardContent className="flex flex-col gap-3 py-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              {editable ? (
                <Input
                  value={descripcion}
                  onChange={(evento) => setDescripcion(evento.target.value)}
                  onBlur={() => {
                    if (descripcion !== (fila.description ?? '')) cambiar({ description: descripcion });
                  }}
                  className="h-9"
                  aria-label="Descripción"
                />
              ) : (
                <p className="font-medium">{fila.description ?? 'Sin descripción'}</p>
              )}
              <p className="mt-1 text-xs text-muted-foreground">{fila.date}</p>
            </div>

            {/* Signo, icono Y color: el estado nunca depende solo del color. */}
            <p
              className={cn(
                'flex shrink-0 items-center gap-1 font-medium tabular-nums',
                esIngreso ? 'text-income' : 'text-expense',
              )}
            >
              {esIngreso ? (
                <ArrowDownLeft className="size-4" aria-hidden="true" />
              ) : (
                <ArrowUpRight className="size-4" aria-hidden="true" />
              )}
              {esIngreso ? '+' : '−'}
              {formatoDeMoneda.format(Number(fila.amount))}
              <span className="sr-only">{esIngreso ? 'ingreso' : 'gasto'}</span>
            </p>
          </div>

          {sospechosa && (
            <p className="flex items-center gap-1.5 text-xs text-warning">
              <CopyCheck className="size-3.5" aria-hidden="true" />
              Se parece a un movimiento que ya tienes
            </p>
          )}

          {editable && (
            <div className="flex flex-wrap items-center gap-2">
              <select
                className="h-9 rounded-md border border-input bg-background px-2 text-xs"
                value={fila.category_id ?? ''}
                onChange={(evento) =>
                  cambiar({
                    category_id: evento.target.value ? Number(evento.target.value) : null,
                  })
                }
                aria-label="Categoría"
              >
                <option value="">Sin categoría</option>
                {categorias.map((categoria) => (
                  <option key={categoria.id} value={categoria.id}>
                    {categoria.name}
                  </option>
                ))}
              </select>

              {fila.confidence !== null && fila.category_id !== null && (
                <span
                  className="flex items-center gap-1 text-xs text-info"
                  title="Sugerido a partir de cómo has clasificado movimientos parecidos"
                >
                  <Sparkles className="size-3" aria-hidden="true" />
                  {fila.confidence}% sugerido
                </span>
              )}

              <select
                className="h-9 rounded-md border border-input bg-background px-2 text-xs"
                value={fila.type}
                onChange={(evento) =>
                  cambiar({ type: evento.target.value as 'expense' | 'income' })
                }
                aria-label="Tipo"
              >
                <option value="expense">Gasto</option>
                <option value="income">Ingreso</option>
              </select>

              <div className="ml-auto flex gap-1">
                <BotonDeEstado
                  activo={fila.status === 'accepted'}
                  onClick={() => cambiar({ status: 'accepted' })}
                  disabled={editar.isPending}
                >
                  <Check className="size-3.5" aria-hidden="true" />
                  Importar
                </BotonDeEstado>
                <BotonDeEstado
                  activo={descartada}
                  onClick={() => cambiar({ status: 'skipped' })}
                  disabled={editar.isPending}
                >
                  <X className="size-3.5" aria-hidden="true" />
                  Dejar fuera
                </BotonDeEstado>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </li>
  );
}

function BotonDeEstado({
  activo,
  children,
  ...props
}: { activo: boolean } & React.ComponentProps<typeof Button>) {
  return (
    <Button
      size="sm"
      variant={activo ? 'default' : 'outline'}
      aria-pressed={activo}
      className="h-9 text-xs"
      {...props}
    >
      {children}
    </Button>
  );
}

/** Se re-exporta para que el router no tenga que conocer el tipo interno. */
export type { ImportRowStatus };
