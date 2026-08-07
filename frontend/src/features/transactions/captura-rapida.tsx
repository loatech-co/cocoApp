import type { TransactionType } from '@coco/types';
import { AlertCircle, Loader2, Sparkles, X } from 'lucide-react';
import { useEffect, useRef, useState, type FormEvent } from 'react';

import { useSugerenciaDeCategoria } from '@/features/categorization/use-sugerencia';

import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ApiClientError } from '@/lib/api-client';
import { useAccounts, useCategories, useCrearMovimiento } from '@/lib/queries';
import { cn } from '@/lib/utils';

/** Fecha de hoy en America/Bogota, formato YYYY-MM-DD. */
function hoyEnBogota(): string {
  const ahora = new Date(Date.now() - 5 * 60 * 60 * 1000);
  return ahora.toISOString().slice(0, 10);
}

const TIPOS: { valor: TransactionType; etiqueta: string; clase: string }[] = [
  { valor: 'expense', etiqueta: 'Gasto', clase: 'data-[activo=true]:bg-expense' },
  { valor: 'income', etiqueta: 'Ingreso', clase: 'data-[activo=true]:bg-income' },
];

/**
 * Captura rápida — la acción más frecuente del producto.
 *
 * Solo monto, tipo y cuenta son obligatorios. La categoría es opcional a
 * propósito: obligar a clasificar en el momento es exactamente la fricción que
 * hace que la gente abandone el hábito de registrar. Se puede categorizar
 * después, en lote y con calma.
 */
export function CapturaRapida({ abierta, onCerrar }: { abierta: boolean; onCerrar: () => void }) {
  const cuentas = useAccounts();
  const categorias = useCategories();
  const crear = useCrearMovimiento();

  const [amount, setAmount] = useState('');
  const [type, setType] = useState<TransactionType>('expense');
  const [accountId, setAccountId] = useState<string>('');
  const [date, setDate] = useState(hoyEnBogota());
  const [categoryId, setCategoryId] = useState<string>('');
  const [merchant, setMerchant] = useState('');
  const [error, setError] = useState<string | null>(null);

  // La sugerencia sale del comercio, que es lo que identifica el movimiento.
  const sugerencia = useSugerenciaDeCategoria(merchant);

  const campoMonto = useRef<HTMLInputElement>(null);

  // Preselecciona la primera cuenta: un toque menos en el caso típico.
  useEffect(() => {
    if (abierta && !accountId && cuentas.data?.length) {
      setAccountId(String(cuentas.data[0]!.id));
    }
  }, [abierta, accountId, cuentas.data]);

  useEffect(() => {
    if (!abierta) return;

    campoMonto.current?.focus();

    const alPresionar = (evento: KeyboardEvent): void => {
      if (evento.key === 'Escape') onCerrar();
    };
    document.addEventListener('keydown', alPresionar);
    return () => document.removeEventListener('keydown', alPresionar);
  }, [abierta, onCerrar]);

  if (!abierta) return null;

  const categoriasPlanas = (categorias.data ?? []).flatMap((padre) => [
    padre,
    ...(padre.children ?? []),
  ]);

  const categoriaSugerida = categoriasPlanas.find(
    (categoria) => categoria.id === sugerencia?.category_id,
  );

  function limpiar(): void {
    setAmount('');
    setMerchant('');
    setCategoryId('');
    setError(null);
  }

  async function onSubmit(evento: FormEvent<HTMLFormElement>): Promise<void> {
    evento.preventDefault();
    setError(null);

    if (!accountId) {
      setError('Necesitas al menos una cuenta para registrar movimientos.');
      return;
    }

    try {
      await crear.mutateAsync({
        account_id: Number(accountId),
        date,
        amount: amount.replace(/[^\d.]/g, ''),
        type,
        ...(categoryId ? { category_id: Number(categoryId) } : {}),
        ...(merchant ? { merchant } : {}),
      });
      limpiar();
      onCerrar();
    } catch (causa) {
      setError(
        causa instanceof ApiClientError ? causa.message : 'No se pudo guardar el movimiento.',
      );
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <div
        className="absolute inset-0 bg-ash-950/50"
        onClick={onCerrar}
        aria-hidden="true"
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="titulo-captura"
        className="relative w-full max-w-md rounded-t-2xl border border-border bg-card p-6 sm:rounded-2xl"
      >
        <div className="mb-5 flex items-center justify-between">
          <h2 id="titulo-captura" className="font-serif text-xl font-semibold">
            Registrar movimiento
          </h2>
          <Button variant="ghost" size="icon" onClick={onCerrar} aria-label="Cerrar">
            <X aria-hidden="true" />
          </Button>
        </div>

        <form onSubmit={(evento) => void onSubmit(evento)} className="flex flex-col gap-4">
          {error && (
            <Alert variant="destructive">
              <AlertCircle aria-hidden="true" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {/* Monto primero y con foco: es el único dato que siempre se conoce. */}
          <div className="flex flex-col gap-2">
            <Label htmlFor="amount">Monto</Label>
            <Input
              id="amount"
              ref={campoMonto}
              inputMode="decimal"
              placeholder="0"
              required
              value={amount}
              onChange={(evento) => setAmount(evento.target.value)}
              className="tabular text-2xl font-semibold h-14"
            />
          </div>

          <div className="flex gap-2" role="group" aria-label="Tipo de movimiento">
            {TIPOS.map((opcion) => (
              <button
                key={opcion.valor}
                type="button"
                data-activo={type === opcion.valor}
                onClick={() => setType(opcion.valor)}
                className={cn(
                  'flex-1 rounded-md border border-input py-2.5 text-sm font-medium transition-colors',
                  'data-[activo=true]:border-transparent data-[activo=true]:text-white',
                  'data-[activo=false]:hover:bg-secondary',
                  opcion.clase,
                )}
              >
                {opcion.etiqueta}
              </button>
            ))}
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="account">Cuenta</Label>
            <Selector
              id="account"
              value={accountId}
              onChange={setAccountId}
              opciones={(cuentas.data ?? []).map((cuenta) => ({
                valor: String(cuenta.id),
                etiqueta: cuenta.name,
              }))}
              vacio="No tienes cuentas todavía"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-2">
              <Label htmlFor="date">Fecha</Label>
              <Input
                id="date"
                type="date"
                value={date}
                onChange={(evento) => setDate(evento.target.value)}
              />
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="category">
                Categoría <span className="text-muted-foreground">(opcional)</span>
              </Label>
              <Selector
                id="category"
                value={categoryId}
                onChange={setCategoryId}
                opciones={categoriasPlanas.map((categoria) => ({
                  valor: String(categoria.id),
                  etiqueta: categoria.name,
                }))}
                vacio="Sin categorizar"
                permitirVacio
              />
            </div>
          </div>


          <div className="flex flex-col gap-2">
            <Label htmlFor="merchant">
              Comercio <span className="text-muted-foreground">(opcional)</span>
            </Label>
            <Input
              id="merchant"
              value={merchant}
              onChange={(evento) => setMerchant(evento.target.value)}
              placeholder="Éxito, Uber, Celsia…"
            />

            {/*
              La sugerencia NUNCA se impone: aparece como una propuesta que hay
              que pulsar, y solo mientras no haya categoría elegida. El
              principio de no-rigidez manda — el sistema sugiere, no decide.
            */}
            {categoriaSugerida && !categoryId && (
              <button
                type="button"
                onClick={() => setCategoryId(String(categoriaSugerida.id))}
                className="flex items-center gap-1.5 self-start rounded-md bg-info-surface px-2.5 py-1.5 text-xs text-info transition-opacity hover:opacity-80"
              >
                <Sparkles className="size-3.5" aria-hidden="true" />
                ¿Categorizar como <strong className="font-semibold">{categoriaSugerida.name}</strong>?
                <span className="text-info/70">
                  {sugerencia?.reason === 'historial'
                    ? 'es como sueles clasificarlo'
                    : 'según tus reglas'}
                </span>
              </button>
            )}
          </div>

          <Button type="submit" size="lg" className="w-full" disabled={crear.isPending}>
            {crear.isPending && <Loader2 className="animate-spin" aria-hidden="true" />}
            {crear.isPending ? 'Guardando…' : 'Guardar'}
          </Button>
        </form>
      </div>
    </div>
  );
}

function Selector({
  id,
  value,
  onChange,
  opciones,
  vacio,
  permitirVacio = false,
}: {
  id: string;
  value: string;
  onChange: (valor: string) => void;
  opciones: { valor: string; etiqueta: string }[];
  vacio: string;
  permitirVacio?: boolean;
}) {
  return (
    <select
      id={id}
      value={value}
      onChange={(evento) => onChange(evento.target.value)}
      className={cn(
        'h-10 w-full rounded-md border border-input bg-card px-3 text-base md:text-sm',
        'outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:border-ring',
      )}
    >
      {(permitirVacio || opciones.length === 0) && <option value="">{vacio}</option>}
      {opciones.map((opcion) => (
        <option key={opcion.valor} value={opcion.valor}>
          {opcion.etiqueta}
        </option>
      ))}
    </select>
  );
}
