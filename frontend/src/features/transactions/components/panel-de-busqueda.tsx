import { Search } from 'lucide-react';
import { useEffect, useState } from 'react';

import { useTransactions } from '@/features/transactions/api/transactions';
import {
  nombreDelMovimiento,
  sentidoDelMovimiento,
} from '@/features/transactions/model/movimientos';
import { useCategories } from '@/shared/api/categories';
import { type Category, type Transaction } from '@/shared/api/generated/model';
import { shortDay } from '@/shared/lib/format';
import { t } from '@/shared/lib/i18n';
import { useOnChange } from '@/shared/lib/on-change';
import { ErrorAlert } from '@/shared/ui/atoms/alert';
import { Amount } from '@/shared/ui/atoms/amount';
import { BottomSheet } from '@/shared/ui/atoms/bottom-sheet';
import { Input } from '@/shared/ui/atoms/input';
import { PanelRow } from '@/shared/ui/atoms/panel-row';
import { Skeleton } from '@/shared/ui/atoms/skeleton';

/** Cuántos resultados caben antes de que la lista deje de ser una respuesta. */
const CUANTOS = 20;

/**
 * Buscar un movimiento, desde cualquier pantalla.
 *
 * ── Por qué es una hoja y no una pantalla ───────────────────────────────────
 * Porque buscar no es ir a otro sitio: es levantar la vista un momento sin
 * soltar lo que se estaba haciendo. Una pantalla de resultados obliga a volver
 * con el botón de atrás, y de vuelta la pantalla anterior ya perdió el sitio
 * donde estaba.
 *
 * ── Por qué los resultados van DENTRO ───────────────────────────────────────
 * La alternativa era llevar lo escrito a la lista de movimientos como filtro,
 * y eso contesta otra pregunta: «enséñame todos los que dicen esto», con su
 * tabla, su orden y su paginador. Aquí la pregunta es «¿dónde está aquel
 * gasto?», y se acaba al encontrarlo: se toca y se abre su ficha.
 *
 * ── El campo SÍ nace enfocado ───────────────────────────────────────────────
 * Es la excepción que la regla del foco concede: un buscador que aparece
 * porque alguien pidió buscar. Pedir buscar y tener que tocar además la caja
 * son dos gestos para una sola intención.
 */
export function PanelDeBusqueda({
  abierto,
  onCerrar,
  onElegir,
}: {
  abierto: boolean;
  onCerrar: () => void;
  onElegir: (movimiento: Transaction) => void;
}) {
  const { texto, setTexto, consulta } = useDebouncedSearch(abierto);

  return (
    <BottomSheet
      isOpen={abierto}
      title={t('shell.bottomBar.search')}
      head={<SearchHead texto={texto} onCambiar={setTexto} />}
      onClose={onCerrar}
    >
      {/*
        La lista es un componente aparte y solo se monta cuando hay algo que
        preguntar. La hoja está montada SIEMPRE —abierta o cerrada, para poder
        deslizarse—, así que una consulta escrita aquí dentro se dispararía en
        todas las pantallas del teléfono aunque nadie haya tocado la lupa.
      */}
      {consulta === '' ? (
        <p className="px-3 py-6 text-center text-sm text-muted-foreground">
          {t('transactions.searchPanel.help')}
        </p>
      ) : (
        <Resultados consulta={consulta} onElegir={onElegir} />
      )}
    </BottomSheet>
  );
}

function Resultados({
  consulta,
  onElegir,
}: {
  consulta: string;
  onElegir: (movimiento: Transaction) => void;
}) {
  const movimientos = useTransactions({ q: consulta, perPage: CUANTOS, sort: '-date' });
  const categorias = useCategories();
  const arbol = categorias.data ?? [];

  if (movimientos.isPending) {
    return (
      <div className="flex flex-col gap-2 py-1">
        {[0, 1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-12 rounded-lg" />
        ))}
      </div>
    );
  }

  if (movimientos.isError) {
    return <ErrorAlert message={t('transactions.searchPanel.failed')} />;
  }

  const filas = movimientos.data.data;

  if (filas.length === 0) {
    return (
      <p className="px-3 py-6 text-center text-sm text-muted-foreground">
        {t('transactions.searchPanel.noMatch', { query: consulta })}
      </p>
    );
  }

  const total = movimientos.data.meta.total;

  return (
    <div className="flex flex-col">
      {filas.map((movimiento) => (
        <ResultRow key={movimiento.id} movimiento={movimiento} arbol={arbol} onElegir={onElegir} />
      ))}

      {/* Cuántos hay de los que caben. Sin esto, veinte resultados de
          trescientos se leen como trescientos. */}
      {total > filas.length && (
        <p className="px-3 pt-3 text-center text-xs text-muted-foreground">
          {t('transactions.searchPanel.latest', { shown: filas.length, total })}
        </p>
      )}
    </div>
  );
}

function ResultRow({
  movimiento,
  arbol,
  onElegir,
}: {
  movimiento: Transaction;
  arbol: Category[];
  onElegir: (movimiento: Transaction) => void;
}) {
  return (
    <PanelRow onClick={() => onElegir(movimiento)}>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium">{nombreDelMovimiento(movimiento, arbol)}</span>
        <span className="block truncate text-xs text-muted-foreground">
          {shortDay(movimiento.date)}
        </span>
      </span>
      <Amount
        amount={movimiento.amount}
        currency={movimiento.currency}
        direction={sentidoDelMovimiento(movimiento.type)}
        className="shrink-0 text-sm"
      />
    </PanelRow>
  );
}

function SearchHead({ texto, onCambiar }: { texto: string; onCambiar: (texto: string) => void }) {
  return (
    <div className="relative">
      <Search
        className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
        aria-hidden="true"
      />
      <Input
        type="search"
        autoFocus
        value={texto}
        onChange={(e) => onCambiar(e.target.value)}
        placeholder={t('transactions.searchPanel.placeholder')}
        aria-label={t('transactions.searchPanel.label')}
        className="pl-9"
      />
    </div>
  );
}

/** Lo que se escribe, y la consulta que sale de ello con un poco de retraso. */
function useDebouncedSearch(abierto: boolean) {
  const [texto, setTexto] = useState('');
  const [consulta, setConsulta] = useState('');

  // Cada apertura empieza en blanco. Reabrir con lo de la vez pasada enseñaría
  // los resultados de una pregunta que ya no se está haciendo.
  useOnChange([abierto], () => {
    if (!abierto) {
      setTexto('');
      setConsulta('');
    }
  });

  // Se escribe local y se consulta con retraso: sin esto cada tecla dispara
  // una petición y la lista parpadea mientras se escribe.
  useEffect(() => {
    const id = setTimeout(() => setConsulta(texto.trim()), 300);
    return () => clearTimeout(id);
  }, [texto]);

  return { texto, setTexto, consulta };
}
