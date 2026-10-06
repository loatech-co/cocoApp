import { ArrowUpRight } from 'lucide-react';

import { type TransactionType } from '@/shared/api/generated/model';
import { longDay, longMonth, formatMoney } from '@/shared/lib/format';
import { t } from '@/shared/lib/i18n';
import { cn } from '@/shared/lib/utils';
import { Card } from '@/shared/ui/atoms/card';
import { Section } from '@/shared/ui/molecules/section';

interface ReadViewProps {
  type: TransactionType;
  name: string;
  value: string;
  /** ISO 4217 code of the movement being read. */
  currency: string;
  date: string;
  /** `YYYY-MM-DD` del día 1 del mes al que PERTENECE el gasto. */
  period?: string | undefined;
  path: string[];
}

/**
 * La columna de los datos cuando solo se está mirando: el movimiento y, si
 * las hay, sus notas.
 *
 * Las notas van con lo que dicen los datos y no debajo de los soportes: el
 * recibo es la prueba de lo que pasó y la nota es el comentario de alguien
 * sobre eso, así que va del lado en el que se cuenta lo que pasó.
 */
export function MovementReadColumn({ notes, ...reading }: ReadViewProps & { notes: string }) {
  return (
    <div className="flex flex-col gap-4">
      <ReadView {...reading} />

      {notes.trim() !== '' && (
        <Section title={t('transactions.fields.notes')}>
          {/* `whitespace-pre-line`: las notas se escriben con saltos de línea
              y aplanarlas convierte una lista en un párrafo. */}
          <p className="whitespace-pre-line text-sm">{notes}</p>
        </Section>
      )}
    </div>
  );
}

/**
 * El movimiento cuando solo se está mirando.
 *
 * ── Por qué no son los mismos campos, apagados ──────────────────────────────
 * Porque un campo apagado sigue siendo un campo: tiene su marco, su etiqueta
 * encima y su altura de control, y ocupa el sitio de una caja donde se podría
 * escribir aunque no se pueda. Ocho de esos, uno debajo de otro, son un
 * formulario que no deja rellenarse —que se lee como una avería— cuando lo
 * que uno viene a hacer es LEER un dato: cuánto fue, cuándo, de qué.
 *
 * ── De dónde sale la jerarquía ──────────────────────────────────────────────
 * De que no todo pese igual. La cifra manda: va grande, en su color. Debajo,
 * sus dos datos inseparables —de qué es y cuándo se pagó— en la misma caja,
 * porque se leen juntos.
 *
 * ── Partido en dos: arriba CUÁNTO, abajo de qué ─────────────────────────────
 * Juntos, la cifra tenía cuatro líneas pegadas debajo y el bloque se leía como
 * un párrafo que empieza con un número grande. La línea los separa en dos
 * registros: el dato que se viene a ver, y el contexto que lo explica.
 *
 * Y es una TARJETA de verdad: `Card` es la superficie que la aplicación ya usa
 * para "esto es una cosa", y aquí dice lo mismo: el movimiento es un objeto, y
 * lo de abajo son sus anexos.
 */
function ReadView({ type, name, value, currency, date, period, path }: ReadViewProps) {
  return (
    <div className="flex flex-col gap-5">
      <Card className="overflow-hidden">
        <div className="px-4 py-5">
          {/*
            SIN `tabular`: aquí no hay columna, hay un número solo y grande, y
            el ancho fijo de las cifras tabulares separa los dígitos como si
            alguien le hubiera metido interletraje.

            Una flecha, no un signo. El menos delante de una cifra es una
            convención de TABLA; aquí la ficha entera es un gasto, y lo dice el
            título. La flecha dice lo mismo mejor: sube y sale, baja y entra.

            36px y los mismos en todas las pantallas: es el dato principal, no
            el único.
          */}
          <p className="flex items-center gap-2 font-display text-4xl font-bold leading-none text-acento-tinta">
            <ArrowUpRight
              className={cn('size-8 shrink-0 sm:size-10', type === 'income' && 'rotate-180')}
              strokeWidth={2.75}
              aria-hidden="true"
            />
            {formatMoney(value || '0', currency)}
          </p>
        </div>

        <ReadDetails name={name} date={date} period={period} path={path} />
      </Card>

      {path.length === 0 && (
        <p className="text-sm text-muted-foreground">{t('transactions.readView.unclassified')}</p>
      )}
    </div>
  );
}

/** De qué es y cuándo se pagó, debajo de la cifra. */
function ReadDetails({
  name,
  date,
  period,
  path,
}: Pick<ReadViewProps, 'name' | 'date' | 'period' | 'path'>) {
  // El periodo solo se nombra cuando NO es el mes del pago. Repetir
  // "septiembre" dos veces seguidas no informa; decirlo cuando la factura de
  // agosto se pagó en septiembre, sí —es lo que descuadra los totales de quien
  // no lo nota—.
  const paymentMonth = date.slice(0, 7);
  const isStale = period !== undefined && period !== '' && period.slice(0, 7) !== paymentMonth;

  return (
    <div className="flex flex-col gap-1 border-t border-border px-4 py-3">
      <p className="truncate text-base font-medium">{name || t('transactions.noConcept')}</p>

      {/* El camino, sin etiqueta y sin fichas. Con fichas parecían pestañas
          —algo que se pulsa y cambia lo de abajo— y aquí no se pulsa nada: es
          dónde vive este movimiento, que se lee como una ruta. */}
      {path.length > 0 && (
        <p className="flex flex-wrap items-center gap-1.5 text-sm text-muted-foreground">
          {path.map((segment, i) => (
            <span key={segment} className="flex items-center gap-1.5">
              {i > 0 && <span aria-hidden="true">›</span>}
              <span className={cn(i === path.length - 1 && 'font-medium text-foreground')}>
                {segment}
              </span>
            </span>
          ))}
        </p>
      )}

      <p className="mt-1 text-xs text-muted-foreground">
        {t('transactions.readView.paidOn', { day: longDay(date) })}
      </p>

      {isStale && (
        <p className="text-xs font-medium text-warning">
          {t('transactions.readView.belongsTo', { month: longMonth(period.slice(0, 7)) })}
        </p>
      )}
    </div>
  );
}
