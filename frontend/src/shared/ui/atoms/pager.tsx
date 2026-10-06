import { ArrowLeft, ArrowRight } from 'lucide-react';

import { t } from '@/shared/lib/i18n';
import { cn } from '@/shared/lib/utils';

/**
 * Paginador. Uno solo para toda la app.
 *
 * Existe como componente y no suelto en cada pantalla porque las reglas de
 * borde —deshabilitar en los extremos, no mostrarse con una sola página,
 * qué números caben— se olvidan la mitad de las veces si hay que reescribirlas.
 *
 * ── Por qué los números y no solo "anterior / siguiente" ────────────────────
 * Porque con ocho páginas uno quiere saltar a la cinco, no pulsar tres veces.
 * Y porque el número encendido dice dónde está uno sin tener que leer un
 * contador aparte.
 *
 * ── Por qué es un grupo pegado y no botones sueltos ─────────────────────────
 * Un solo borde alrededor de todo lo presenta como UN control: los botones
 * sueltos con espacio entre ellos se leen como acciones distintas, y "3" no es
 * una acción distinta de "4".
 */
export function Pager({
  page,
  total,
  perPage,
  onPageChange,
  className,
}: {
  page: number;
  /** Total de FILAS, no de páginas: es lo que devuelve la API. */
  total: number;
  perPage: number;
  onPageChange: (page: number) => void;
  className?: string;
}) {
  const pages = Math.max(1, Math.ceil(total / perPage));

  // Con una sola página no hay nada que paginar, y mostrar dos botones muertos
  // solo añade ruido.
  if (pages <= 1) return null;

  return (
    <nav className={cn('flex justify-center', className)} aria-label={t('common.pagination')}>
      {/*
        Sin relleno propio: el paginador se apoya en el fondo de la página en
        vez de flotar sobre él. Con `bg-card` se leía como una tarjeta más —del
        mismo color que las que tienen contenido— y competía por atención con
        la tabla que acaba de terminar de leerse.

        Se queda el marco, fino y tenue, porque es lo que lo presenta como UN
        control y no como siete botones sueltos.
      */}
      <ul className="inline-flex items-stretch divide-x divide-border/70 overflow-hidden rounded-lg border border-border/70">
        <li>
          <Cell
            isDisabled={page <= 1}
            onClick={() => onPageChange(page - 1)}
            aria-label={t('common.previousPage')}
          >
            <ArrowLeft className="size-4" aria-hidden="true" />
            <span className="hidden sm:inline">{t('common.previous')}</span>
          </Cell>
        </li>

        <PageNumbers page={page} pages={pages} onPageChange={onPageChange} />

        <li>
          <Cell
            isDisabled={page >= pages}
            onClick={() => onPageChange(page + 1)}
            aria-label={t('common.nextPage')}
          >
            <span className="hidden sm:inline">{t('common.next')}</span>
            <ArrowRight className="size-4" aria-hidden="true" />
          </Cell>
        </li>
      </ul>
    </nav>
  );
}

function Cell({
  children,
  isCurrent = false,
  isDisabled = false,
  onClick,
  ...props
}: {
  children: React.ReactNode;
  isCurrent?: boolean;
  isDisabled?: boolean;
  onClick: () => void;
} & React.ComponentProps<'button'>) {
  return (
    <button
      type="button"
      disabled={isDisabled}
      onClick={onClick}
      className={cn(
        'flex h-9 items-center justify-center gap-2 px-3 text-sm font-medium transition-colors',
        isCurrent
          ? 'bg-muted/70 text-foreground'
          : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground',
        isDisabled && 'cursor-not-allowed opacity-40 hover:bg-transparent',
      )}
      {...props}
    >
      {children}
    </button>
  );
}

/**
 * Qué números se dibujan. `null` es un salto (…).
 *
 * Con cincuenta páginas no caben cincuenta botones, así que se muestran los
 * extremos, la actual y sus vecinas. Los extremos siempre: son los dos saltos
 * que uno quiere dar —al principio y al final— y sin ellos hay que pulsar
 * "siguiente" cuarenta veces.
 */
export function visiblePageNumbers(page: number, pages: number, gap = 1): (number | null)[] {
  if (pages <= 7) return Array.from({ length: pages }, (_, i) => i + 1);

  const near = new Set<number>([1, pages, page]);
  for (let d = 1; d <= gap; d += 1) {
    if (page - d > 1) near.add(page - d);
    if (page + d < pages) near.add(page + d);
  }

  const order = [...near].sort((a, b) => a - b);
  const result: (number | null)[] = [];

  let previous: number | undefined;
  for (const isCurrent of order) {
    // Un salto de UN número no se dibuja con puntos: "1 … 3" ocupa lo mismo
    // que "1 2 3" y esconde una página por nada.
    if (previous !== undefined && isCurrent - previous > 1) {
      result.push(isCurrent - previous === 2 ? isCurrent - 1 : null);
    }
    result.push(isCurrent);
    previous = isCurrent;
  }

  return result;
}

/** Los números de página, con sus saltos. */
function PageNumbers({
  page,
  pages,
  onPageChange,
}: {
  page: number;
  pages: number;
  onPageChange: (page: number) => void;
}) {
  return (
    <>
      {visiblePageNumbers(page, pages).map((n, i) =>
        n === null ? (
          // eslint-disable-next-line @eslint-react/no-array-index-key -- un salto «…» no tiene más identidad que su posición
          <li key={`salto-${i}`}>
            <span className="grid h-9 w-9 place-items-center text-sm text-muted-foreground">…</span>
          </li>
        ) : (
          <li key={n}>
            <Cell
              isCurrent={n === page}
              onClick={() => onPageChange(n)}
              aria-label={t('common.pageN', { n })}
              aria-current={n === page ? 'page' : undefined}
            >
              <span className="tabular w-4 text-center">{n}</span>
            </Cell>
          </li>
        ),
      )}
    </>
  );
}
