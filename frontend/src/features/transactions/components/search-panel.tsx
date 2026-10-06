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
const MAX_RESULTS = 20;

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
export function SearchPanel({
  isOpen,
  onClose,
  onSelect,
}: {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (transaction: Transaction) => void;
}) {
  const { text, setText, query } = useDebouncedSearch(isOpen);

  return (
    <BottomSheet
      isOpen={isOpen}
      title={t('shell.bottomBar.search')}
      head={<SearchHead text={text} onChange={setText} />}
      onClose={onClose}
    >
      {/*
        La lista es un componente aparte y solo se monta cuando hay algo que
        preguntar. La hoja está montada SIEMPRE —abierta o cerrada, para poder
        deslizarse—, así que una consulta escrita aquí dentro se dispararía en
        todas las pantallas del teléfono aunque nadie haya tocado la lupa.
      */}
      {query === '' ? (
        <p className="px-3 py-6 text-center text-sm text-muted-foreground">
          {t('transactions.searchPanel.help')}
        </p>
      ) : (
        <Results query={query} onSelect={onSelect} />
      )}
    </BottomSheet>
  );
}

function Results({
  query,
  onSelect,
}: {
  query: string;
  onSelect: (transaction: Transaction) => void;
}) {
  const transactions = useTransactions({ q: query, perPage: MAX_RESULTS, sort: '-date' });
  const categories = useCategories();
  const tree = categories.data ?? [];

  if (transactions.isPending) {
    return (
      <div className="flex flex-col gap-2 py-1">
        {[0, 1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-12 rounded-lg" />
        ))}
      </div>
    );
  }

  if (transactions.isError) {
    return <ErrorAlert message={t('transactions.searchPanel.failed')} />;
  }

  const rows = transactions.data.data;

  if (rows.length === 0) {
    return (
      <p className="px-3 py-6 text-center text-sm text-muted-foreground">
        {t('transactions.searchPanel.noMatch', { query })}
      </p>
    );
  }

  const total = transactions.data.meta.total;

  return (
    <div className="flex flex-col">
      {rows.map((transaction) => (
        <ResultRow key={transaction.id} transaction={transaction} tree={tree} onSelect={onSelect} />
      ))}

      {/* Cuántos hay de los que caben. Sin esto, veinte resultados de
          trescientos se leen como trescientos. */}
      {total > rows.length && (
        <p className="px-3 pt-3 text-center text-xs text-muted-foreground">
          {t('transactions.searchPanel.latest', { shown: rows.length, total })}
        </p>
      )}
    </div>
  );
}

function ResultRow({
  transaction,
  tree,
  onSelect,
}: {
  transaction: Transaction;
  tree: Category[];
  onSelect: (transaction: Transaction) => void;
}) {
  return (
    <PanelRow onClick={() => onSelect(transaction)}>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium">{nombreDelMovimiento(transaction, tree)}</span>
        <span className="block truncate text-xs text-muted-foreground">
          {shortDay(transaction.date)}
        </span>
      </span>
      <Amount
        amount={transaction.amount}
        currency={transaction.currency}
        direction={sentidoDelMovimiento(transaction.type)}
        className="shrink-0 text-sm"
      />
    </PanelRow>
  );
}

function SearchHead({ text, onChange }: { text: string; onChange: (text: string) => void }) {
  return (
    <div className="relative">
      <Search
        className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
        aria-hidden="true"
      />
      <Input
        type="search"
        autoFocus
        value={text}
        onChange={(e) => onChange(e.target.value)}
        placeholder={t('transactions.searchPanel.placeholder')}
        aria-label={t('transactions.searchPanel.label')}
        className="pl-9"
      />
    </div>
  );
}

/** Lo que se escribe, y la consulta que sale de ello con un poco de retraso. */
function useDebouncedSearch(isOpen: boolean) {
  const [text, setText] = useState('');
  const [query, setQuery] = useState('');

  // Cada apertura empieza en blanco. Reabrir con lo de la vez pasada enseñaría
  // los resultados de una pregunta que ya no se está haciendo.
  useOnChange([isOpen], () => {
    if (!isOpen) {
      setText('');
      setQuery('');
    }
  });

  // Se escribe local y se consulta con retraso: sin esto cada tecla dispara
  // una petición y la lista parpadea mientras se escribe.
  useEffect(() => {
    const id = setTimeout(() => setQuery(text.trim()), 300);
    return () => clearTimeout(id);
  }, [text]);

  return { text, setText, query };
}
