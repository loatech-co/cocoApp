import { Loader2, X } from 'lucide-react';
import { useEffect, useRef, useState, type FormEvent } from 'react';

import { rutaSeleccionada } from '@/components/toolbar-filtros';
import { Button } from '@/components/ui/button';
import { SelectorDeDia } from '@/components/selector-de-dia';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { ApiClientError } from '@/lib/api-client';
import { useActualizarMovimiento, useCategories, useCrearMovimiento } from '@/lib/queries';
import { cn } from '@/lib/utils';
import type { Category, Transaction, TransactionType } from '@coco/types';

/**
 * El ÚNICO formulario de movimiento: crea y edita.
 *
 * Tener dos —uno para registrar y otro para corregir— garantiza que se
 * separen: se añade un campo en uno y se olvida en el otro, y la persona
 * descubre que solo puede poner notas cuando edita. Un solo componente, dos
 * modos.
 *
 * ── La cascada de tres niveles ──────────────────────────────────────────────
 * Centro de costos → grupo → concepto. Se guarda el CONCEPTO, que es la hoja:
 * los dos de arriba existen para sumar, no para clasificar. Elegir uno de
 * arriba y dejarlo ahí sería un movimiento que no aparece en ningún desglose
 * por concepto.
 */
export function MovimientoModal({
  abierta,
  movimiento,
  onCerrar,
}: {
  abierta: boolean;
  /** Sin movimiento, el formulario crea. Con movimiento, edita ese. */
  movimiento?: Transaction | null;
  onCerrar: () => void;
}) {
  const categorias = useCategories();
  const crear = useCrearMovimiento();
  const actualizar = useActualizarMovimiento();
  const primerCampo = useRef<HTMLInputElement>(null);

  const editando = Boolean(movimiento);

  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(hoyEnBogota());
  const [type, setType] = useState<TransactionType>('expense');
  const [categoryId, setCategoryId] = useState<number | undefined>();
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);

  // Cada vez que se abre se recarga desde el movimiento: sin esto, abrir para
  // editar el segundo movimiento mostraría los datos del primero.
  useEffect(() => {
    if (!abierta) return;
    setDescription(movimiento?.description ?? '');
    setAmount(movimiento ? String(Number(movimiento.amount)) : '');
    setDate(movimiento?.date ?? hoyEnBogota());
    setType(movimiento?.type ?? 'expense');
    setCategoryId(movimiento?.category_id ?? undefined);
    setNotes(movimiento?.notes ?? '');
    setError(null);
    setTimeout(() => primerCampo.current?.focus(), 50);
  }, [abierta, movimiento]);

  useEffect(() => {
    if (!abierta) return;
    const alPulsar = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onCerrar();
    };
    document.addEventListener('keydown', alPulsar);
    return () => document.removeEventListener('keydown', alPulsar);
  }, [abierta, onCerrar]);

  if (!abierta) return null;

  const arbol = categorias.data ?? [];
  const { centro, grupo, concepto } = rutaSeleccionada(arbol, categoryId);

  async function onSubmit(evento: FormEvent<HTMLFormElement>): Promise<void> {
    evento.preventDefault();
    setError(null);

    const cuerpo = {
      date,
      amount: amount.replace(',', '.'),
      type,
      description: description.trim() || null,
      // El comercio sigue a la descripción: es lo que alimenta la
      // categorización automática de futuras importaciones.
      merchant: description.trim() || null,
      notes: notes.trim() || null,
      category_id: categoryId ?? null,
    };

    try {
      if (movimiento) await actualizar.mutateAsync({ id: movimiento.id, cambios: cuerpo });
      else await crear.mutateAsync(cuerpo as never);
      onCerrar();
    } catch (e) {
      setError(e instanceof ApiClientError ? e.message : 'No se pudo guardar.');
    }
  }

  const guardando = crear.isPending || actualizar.isPending;

  return (
    <div
      // `bg-carbon-950/50` no pintaba nada: `carbon` no existe en esta paleta,
      // así que la clase no generaba ningún color y el modal flotaba sobre la
      // página sin velo detrás.
      className="fixed inset-0 z-50 flex items-end justify-center bg-tinta-950/60 p-0 backdrop-blur-sm sm:items-center sm:p-4"
      onClick={onCerrar}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={editando ? 'Editar movimiento' : 'Nuevo movimiento'}
        onClick={(e) => e.stopPropagation()}
        // En móvil entra desde abajo y ocupa el ancho: es el patrón que la
        // gente espera de una app, y deja el pulgar cerca de los botones.
        className={cn(
          'max-h-[92dvh] w-full overflow-y-auto bg-popover p-5',
          'shadow-[var(--sombra-flotante)] ring-1 ring-black/5 dark:ring-white/12',
          'rounded-t-2xl sm:max-w-lg sm:rounded-2xl',
          'pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:pb-5',
        )}
      >
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="text-xl font-semibold">
            {editando ? 'Editar movimiento' : 'Nuevo movimiento'}
          </h2>
          <button
            type="button"
            onClick={onCerrar}
            aria-label="Cerrar"
            className="rounded-full p-2 text-muted-foreground transition-colors hover:bg-secondary"
          >
            <X className="size-5" aria-hidden="true" />
          </button>
        </div>

        <form onSubmit={(e) => void onSubmit(e)} className="flex flex-col gap-4">
          <div className="flex gap-2" role="group" aria-label="Tipo de movimiento">
            {(['expense', 'income'] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setType(t)}
                aria-pressed={type === t}
                className={cn(
                  'flex-1 rounded-full py-2.5 text-sm font-medium transition-colors',
                  type === t
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-secondary text-secondary-foreground',
                )}
              >
                {t === 'expense' ? 'Gasto' : 'Ingreso'}
              </button>
            ))}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="mov-concepto">Concepto</Label>
            <Input
              id="mov-concepto"
              ref={primerCampo}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Celsia, colegio, mercado…"
              maxLength={255}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="mov-valor">Valor</Label>
              <Input
                id="mov-valor"
                // `inputMode` numérico abre el teclado de números en el
                // teléfono; `type=number` traería flechitas y rechazaría la
                // coma decimal que se usa en Colombia.
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0"
                required
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="mov-fecha">Fecha</Label>
              <SelectorDeDia id="mov-fecha" valor={date} onElegir={setDate} requerido />
            </div>
          </div>

          <fieldset className="flex flex-col gap-3 rounded-2xl bg-secondary/60 p-3">
            <legend className="px-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Dónde se clasifica
            </legend>

            <Cascada
              etiqueta="Centro de costos"
              valor={centro?.id}
              opciones={arbol}
              onElegir={setCategoryId}
            />
            <Cascada
              etiqueta="Grupo"
              valor={grupo?.id}
              opciones={centro?.children ?? []}
              deshabilitado={!centro}
              onElegir={(id) => setCategoryId(id ?? centro?.id)}
            />
            <Cascada
              etiqueta="Concepto"
              valor={concepto?.id}
              opciones={grupo?.children ?? []}
              deshabilitado={!grupo}
              onElegir={(id) => setCategoryId(id ?? grupo?.id)}
            />

            <p className="px-1 text-xs text-muted-foreground">
              Un movimiento puede quedarse sin clasificar. Se guarda igual.
            </p>
          </fieldset>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="mov-notas">Notas</Label>
            <textarea
              id="mov-notas"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="rounded-lg border bg-card px-3 py-2 text-sm"
              style={{ borderColor: 'var(--input)' }}
              placeholder="Opcional"
            />
          </div>

          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}

          <div className="flex gap-2 pt-1">
            <Button type="button" variant="ghost" onClick={onCerrar} className="flex-1">
              Cancelar
            </Button>
            <Button type="submit" disabled={guardando} className="flex-1">
              {guardando && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
              {editando ? 'Guardar' : 'Registrar'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

function Cascada({
  etiqueta,
  valor,
  opciones,
  deshabilitado,
  onElegir,
}: {
  etiqueta: string;
  valor?: number;
  opciones: Category[];
  deshabilitado?: boolean;
  onElegir: (id: number | undefined) => void;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-xs font-medium text-muted-foreground">{etiqueta}</span>
      <Select
        etiqueta={etiqueta}
        vacio="Sin elegir"
        valor={valor === undefined ? '' : String(valor)}
        deshabilitado={deshabilitado}
        opciones={opciones.map((o) => ({ valor: String(o.id), etiqueta: o.name }))}
        onCambiar={(v) => onElegir(v === '' ? undefined : Number(v))}
      />
    </label>
  );
}

/** Hoy en America/Bogota, para que la fecha por defecto no dependa del navegador. */
function hoyEnBogota(): string {
  return new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString().slice(0, 10);
}
