import { Loader2 } from 'lucide-react';
import type { ComponentProps, SubmitEvent } from 'react';

import type { MovementSheetState } from '@/features/transactions/hooks/use-movement-form';
import { nombreDelMovimiento, rutaSeleccionada } from '@/features/transactions/model/transactions';
import { type Transaction } from '@/shared/api/generated/model';
import { DEFAULT_CURRENCY } from '@/shared/lib/format';
import { t } from '@/shared/lib/i18n';
import { Button } from '@/shared/ui/atoms/button';
import { ModalFooter } from '@/shared/ui/molecules/modal-parts';

import { MovementFields } from './movement-fields';
import { MovementReadColumn } from './movement-read-view';
import { PendingReceipts } from './pending-supports';
import { Receipts } from './receipts';

/**
 * LA rejilla de una ficha de movimiento: el papel y lo que dice.
 *
 * ── Por qué una clase y no dos rejillas escritas ────────────────────────────
 * Porque la ficha tiene cinco caras —leer, editar, registrar a mano, registrar
 * con un archivo y, pronto, con una foto— y las cinco son lo mismo: un
 * documento a la izquierda y sus datos a la derecha. Escrita en cada una, la
 * de leer y la de editar ya se habían separado: al pulsar «Editar», el recibo
 * saltaba de sitio y las columnas cambiaban de ancho en el mismo gesto.
 *
 * ── El reparto: mitad y mitad ───────────────────────────────────────────────
 * Se probó a favor del papel —65 y 35— y no hacía falta. Desde que la columna
 * del documento perdió su fila de miniaturas, lo que hay en ella es una sola
 * previsualización de 350px de alto: darle dos tercios del ancho solo la deja
 * con aire a los lados mientras los campos de al lado se aprietan.
 *
 * Por debajo de `lg` no hay reparto: son dos filas apiladas, porque en un
 * teléfono dos columnas de 170px no son dos columnas.
 */
const SHEET_GRID = 'grid gap-5 lg:min-h-0 lg:flex-1 lg:auto-rows-fr lg:grid-cols-2';

type FieldsProps = ComponentProps<typeof MovementFields>;

type SheetFormProps = FieldsProps & {
  transaction: Transaction | null | undefined;
  scan: (file: File) => Promise<void>;
  onSubmit: (event: SubmitEvent<HTMLFormElement>) => Promise<void>;
  isSaving: boolean;
  onCancel: () => void;
};

/**
 * El formulario de la ficha: el soporte a la izquierda, los datos a la derecha
 * —para leer o para editar— y el pie.
 */
export function MovementSheetForm({
  transaction,
  scan,
  onSubmit,
  isSaving,
  onCancel,
  ...fields
}: SheetFormProps) {
  const { sheet } = fields;

  return (
    <form onSubmit={(e) => void onSubmit(e)} className="flex flex-1 flex-col gap-4">
      {/*
        ── La misma rejilla, se esté leyendo o editando ──────────────────────
        Y la MISMA en el árbol, no una copia en cada rama: la columna del papel
        se pinta una vez, fuera del condicional, así que al pulsar «Editar»
        React no la desmonta. Escrita dentro de las dos ramas, el soporte se
        descargaba otra vez en cada cambio —el marco se vaciaba, aparecía el
        girador y volvía la misma imagen que ya estaba en la memoria de la
        pestaña—.

        Lo único que cambia de lado a lado es la columna derecha: los campos o
        lo que dicen.
      */}
      <div className={SHEET_GRID}>
        <div className="flex flex-col">
          {transaction ? (
            <Receipts transactionId={transaction.id} />
          ) : (
            <PendingSupportsColumn sheet={sheet} scan={scan} />
          )}
        </div>

        {sheet.editable ? (
          <MovementFields {...fields} />
        ) : (
          <ReadColumn sheet={sheet} transaction={transaction} tree={fields.tree} />
        )}
      </div>

      {sheet.error && (
        <p role="alert" className="text-sm text-destructive">
          {sheet.error}
        </p>
      )}

      {/* Leyendo no hay pie: no hay nada que cancelar ni que guardar, y para
          salir ya está la equis de la esquina. Un botón "Cerrar" debajo de
          todo es una segunda puerta a la misma salida. */}
      {sheet.editable && (
        <ModalFooter>
          <Button type="button" variant="outline" onClick={onCancel}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" disabled={isSaving}>
            {isSaving && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
            {transaction ? t('common.save') : t('transactions.sheet.register')}
          </Button>
        </ModalFooter>
      )}
    </form>
  );
}

/**
 * Los soportes de un movimiento que todavía no existe.
 *
 * The FIRST document of a new movement is read. Whether it came from the drop
 * zone, the paste button, "Cargar archivo" or the camera: the receipt is what
 * turns the expected (or empty) value and date into the real ones. Attaching
 * it and having nothing happen left the document as decoration and forced
 * typing what the app can read.
 *
 * Only the first, and only when there is none yet: the rest stay attached
 * unread, because what fills the form is ONE document. What was read shows up
 * as a notice to verify, not as a saved fact.
 */
function PendingSupportsColumn({
  sheet,
  scan,
}: {
  sheet: MovementSheetState;
  scan: (file: File) => Promise<void>;
}) {
  return (
    <PendingReceipts
      files={sheet.pendientes}
      onAdd={(added) => {
        const [first, ...rest] = added;

        if (sheet.pendientes.length === 0 && first) {
          void scan(first).then(() => {
            if (rest.length > 0) sheet.setPendientes((p) => [...p, ...rest]);
          });
          return;
        }

        sheet.setPendientes((p) => [...p, ...added]);
      }}
      onRemove={(i) => sheet.setPendientes((p) => p.filter((_, n) => n !== i))}
      onTakePhoto={() => sheet.setPaso('camara')}
    />
  );
}

/** La columna de los datos, solo para mirar. */
function ReadColumn({
  sheet,
  transaction,
  tree,
}: {
  sheet: MovementSheetState;
  transaction: Transaction | null | undefined;
  tree: FieldsProps['tree'];
}) {
  const { centro, categoria, concepto } = rutaSeleccionada(tree, sheet.categoryId);

  return (
    <MovementReadColumn
      type={sheet.type}
      // El nombre sale del concepto, igual que en la tabla. Leía `description`,
      // que en un movimiento registrado a mano está vacío desde que la ficha
      // cambió su campo libre por un selector.
      name={transaction ? nombreDelMovimiento(transaction, tree) : ''}
      value={sheet.amount}
      currency={transaction?.currency ?? DEFAULT_CURRENCY}
      date={sheet.date}
      period={transaction?.period}
      path={[centro?.name, categoria?.name, concepto?.name].filter(Boolean) as string[]}
      notes={sheet.notes}
    />
  );
}
