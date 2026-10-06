import { useState } from 'react';

import { useDeleteCategory, useCategoryUsage } from '@/features/cost-centers/api/categories';
import { ApiClientError } from '@/shared/api/api-client';
import { type CategoryTree } from '@/shared/api/categories';
import { t } from '@/shared/lib/i18n';
import { useOnChange } from '@/shared/lib/on-change';
import { Alert, AlertDescription, ErrorAlert } from '@/shared/ui/atoms/alert';
import { Field } from '@/shared/ui/atoms/field';
import { Confirmation } from '@/shared/ui/organisms/confirmation';
import { Select } from '@/shared/ui/organisms/select';

interface ConfirmDeletionProps {
  category: CategoryTree;
  /**
   * En cuál de los tres niveles está lo que se va a borrar.
   *
   * Se pasa y no se deduce porque una `CategoryTree` no dice a qué profundidad
   * vive: para saberlo habría que recorrer el árbol entero buscándola, y quien
   * abre este diálogo ya lo sabe —lo abrió desde la fila de un centro, de una
   * categoría o de un concepto—.
   *
   * De aquí sale TODO el texto: cómo se llama lo que se borra y cómo se llama
   * lo que cuelga de ello. Con una sola frase para los tres, borrar un centro
   * de costos decía «estás a punto de borrar la categoría “Vivienda”», que es
   * nombrar mal justo en la pantalla donde más caro sale equivocarse.
   */
  level: CategoryLevel;
  /** El árbol entero: de ahí salen los destinos posibles. */
  tree: CategoryTree[];
  isOpen: boolean;
  onClose: () => void;
  /** Se llama después de borrar. Por ejemplo, para cerrar la ficha de encima. */
  onDeleted?: (() => void) | undefined;
}

/**
 * Confirmar el borrado de un centro de costos, una categoría o un concepto.
 *
 * ── Por qué es un componente y no tres diálogos ─────────────────────────────
 * Porque los tres niveles borran lo mismo —una categoría con lo que cuelgue de
 * ella— y la pregunta que hay que hacer es la misma. Estaban escritos tres
 * veces con el mismo texto copiado, y ese texto era además una descripción de
 * una regla del sistema en vez de una ayuda: «Si tiene movimientos, el sistema
 * se niega: no se elimina nada que deje filas sin clasificar».
 *
 * ── Y por qué el sistema ya no se niega ─────────────────────────────────────
 * Negarse dejaba la estructura sin forma de corregirse: un concepto mal creado
 * con un movimiento dentro no se podía quitar nunca. Lo que faltaba no era una
 * prohibición, era una PREGUNTA: a dónde pasan sus movimientos. Eso es un
 * dato, y se pide aquí.
 *
 * No se elige solo. El sistema no sabe si el alquiler mal clasificado
 * pertenece a «Vivienda» o a «Oficina», y adivinar significa mover plata a un
 * sitio que nadie pidió.
 *
 * ── Qué NO se borra ─────────────────────────────────────────────────────────
 * Los movimientos. Cambian de categoría y siguen ahí, con su fecha y su monto.
 * Hay que decirlo, porque «eliminar» junto a un número de movimientos se lee
 * como que se van los movimientos.
 */
/** The three levels of the tree. */
type CategoryLevel = 'costCenter' | 'category' | 'concept';

export function ConfirmDeletion({
  category,
  level,
  tree,
  isOpen,
  onClose,
  onDeleted,
}: ConfirmDeletionProps) {
  const deletion = useDeletionFlow({ category, isOpen, onClose, onDeleted });
  const { usage, target, error, transactions } = deletion;
  const shouldReassign = transactions > 0;

  return (
    <Confirmation
      isOpen={isOpen}
      title={t('centers.deletion.title', { name: category.name })}
      isDestructive
      confirmLabel={t('common.delete')}
      isBusy={deletion.isBusy}
      // Con movimientos dentro no se puede confirmar hasta decir a dónde van.
      // Apagado y no «falla al pulsar»: enterarse después de pulsar «Eliminar»
      // en un diálogo que avisa de que no se puede deshacer es lo peor.
      // Without the count it is unknown whether movements hang below: deleting
      // blind would leave them unclassified with no question asked.
      isConfirmDisabled={usage.isError || (shouldReassign && target === '')}
      onCancel={onClose}
      onConfirm={deletion.confirm}
    >
      <div className="flex flex-col gap-3">
        {/* Qué se va, y la pregunta. Los tres golpes del patrón: qué pasa, que
            no hay vuelta atrás, y si de verdad. */}
        <p>{whatGetsDeleted(level, category.name, usage.data?.subcategories ?? 0)}</p>

        {usage.isPending && <p>{t('centers.deletion.counting')}</p>}

        {usage.isError && <ErrorAlert message={t('centers.deletion.countFailed')} />}

        {shouldReassign && (
          <ReassignTarget
            transactions={transactions}
            target={target}
            onChange={deletion.setTarget}
            options={possibleTargets(tree, category.id)}
          />
        )}

        {/*
          La pregunta va DESPUÉS del selector, no antes.

          Es el último golpe del patrón —qué pasa, que no hay vuelta atrás, y
          si de verdad—, y cuando hay movimientos dentro, entre la advertencia
          y el botón se mete un campo que hay que rellenar. Con la pregunta
          arriba quedaba contestada antes de poder contestarla; aquí abajo cae
          justo encima de los botones, que es donde se responde.
        */}
        <p>{t('centers.deletion.areYouSure')}</p>

        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
      </div>
    </Confirmation>
  );
}

/** Lo que se borra, a dónde van sus movimientos y cómo se confirma. */
function useDeletionFlow({
  category,
  isOpen,
  onClose,
  onDeleted,
}: Pick<ConfirmDeletionProps, 'category' | 'isOpen' | 'onClose' | 'onDeleted'>) {
  const deleteCategory = useDeleteCategory();
  // Solo se pregunta cuando el diálogo está abierto: es una consulta por
  // categoría, y el árbol tiene cuarenta.
  const usage = useCategoryUsage(isOpen ? category.id : undefined);

  const [target, setTarget] = useState('');
  const [error, setError] = useState<string | null>(null);

  // Cada apertura empieza limpia: un destino elegido y cancelado la vez
  // anterior no tiene por qué reaparecer apuntando a otra categoría.
  useOnChange([isOpen], () => {
    if (isOpen) {
      setTarget('');
      setError(null);
    }
  });

  function confirm(): void {
    setError(null);
    deleteCategory.mutate(
      {
        id: category.id,
        reassignTo: target === '' ? undefined : Number(target),
      },
      {
        onSuccess: () => {
          onClose();
          onDeleted?.();
        },
        onError: (e) =>
          setError(e instanceof ApiClientError ? e.message : t('centers.deletion.failed')),
      },
    );
  }

  return {
    usage,
    transactions: usage.data?.transactions ?? 0,
    isBusy: deleteCategory.isPending || usage.isPending,
    target,
    setTarget,
    error,
    confirm,
  };
}

function ReassignTarget({
  transactions,
  target,
  onChange,
  options,
}: {
  transactions: number;
  target: string;
  onChange: (target: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <>
      <Alert variant="warning">
        <AlertDescription>
          {/* «A donde elijas» y no «a la categoría que elijas»: el
              destino puede ser un centro de costos, una categoría o un
              concepto —los tres niveles están en la lista—, así que
              nombrar solo uno prometería menos de lo que se ofrece. */}
          {transactions === 1
            ? t('centers.deletion.movesOne')
            : t('centers.deletion.movesMany', { n: transactions })}
        </AlertDescription>
      </Alert>

      <Field label={t('centers.deletion.destination')} id="destino-del-borrado">
        <Select
          id="destino-del-borrado"
          label={t('centers.deletion.destination')}
          emptyLabel={t('centers.deletion.chooseDestination')}
          value={target}
          options={options}
          onChange={onChange}
        />
      </Field>
    </>
  );
}

/**
 * La primera frase: qué estructura se va con esto.
 *
 * ── Cada nivel se llama por su nombre ───────────────────────────────────────
 * Y lo que cuelga de él, también. Decía «la categoría “Vivienda” y la que
 * tiene dentro» para los tres, y era dos cosas mal a la vez: «Vivienda» es un
 * centro de costos, no una categoría, y «la que tiene dentro» obliga a
 * adivinar qué es «la que» —¿otra categoría?, ¿un concepto?, ¿un movimiento?—
 * justo en la frase que avisa de que esto no se deshace.
 *
 * Un concepto no tiene nada dentro: es la última hoja del árbol, así que su
 * frase no habla de hijos aunque le llegue un número.
 */
function whatGetsDeleted(level: CategoryLevel, name: string, count: number): string {
  /*
    Las frases enteras, no piezas que se peguen.

    El español concuerda en género y en número, y un centro de costos tiene
    CATEGORÍAS mientras que una categoría tiene CONCEPTOS: pegando un artículo
    a una palabra salían «la 3 conceptos» y «el categoría». Escritas enteras no
    hay forma de que una concuerde mal.
  */
  const { subject, one, many } = {
    costCenter: {
      subject: t('centers.deletion.thisCostCenter'),
      one: t('centers.deletion.oneCategory'),
      many: (n: number) => t('centers.deletion.manyCategories', { n }),
    },
    category: {
      subject: t('centers.deletion.thisCategory'),
      one: t('centers.deletion.oneConcept'),
      many: (n: number) => t('centers.deletion.manyConcepts', { n }),
    },
    // Un concepto es la última hoja del árbol: no tiene nada dentro, así que
    // su frase no habla de hijos aunque le llegue un número.
    concept: { subject: t('centers.deletion.thisConcept'), one: null, many: null },
  }[level];

  const inside =
    count === 0 || one === null
      ? ''
      : t('centers.deletion.andInside', { what: count === 1 ? one : many(count) });

  return t('centers.deletion.summary', { what: subject, name, inside });
}

/**
 * A dónde se puede reasignar: todo el árbol MENOS lo que se va a borrar.
 *
 * ── Por qué el camino entero en la etiqueta ─────────────────────────────────
 * Porque «Aseo» a secas no distingue el de Casa del de Oficina, y la lista es
 * plana: un desplegable con «Aseo» dos veces obliga a adivinar cuál es cuál
 * justo cuando se está moviendo plata de sitio.
 *
 * ── Por qué se ofrecen los tres niveles ─────────────────────────────────────
 * Lo normal es pasar los movimientos a otro concepto, y por eso los conceptos
 * son la mayoría de la lista. Pero al borrar una categoría entero puede no haber un
 * concepto equivalente todavía, y dejarlos colgando dla categoría de destino es
 * mejor que no poder borrar: siguen clasificados, y el concepto se les asigna
 * después desde la tabla.
 */
function possibleTargets(
  tree: CategoryTree[],
  excludedId: number,
): { value: string; label: string }[] {
  const result: { value: string; label: string }[] = [];

  for (const costCenter of tree) {
    if (costCenter.id === excludedId) continue;
    result.push({ value: String(costCenter.id), label: costCenter.name });

    for (const category of costCenter.children ?? []) {
      if (category.id === excludedId) continue;
      result.push({ value: String(category.id), label: `${costCenter.name} › ${category.name}` });

      for (const concept of category.children ?? []) {
        if (concept.id === excludedId) continue;
        result.push({
          value: String(concept.id),
          label: `${costCenter.name} › ${category.name} › ${concept.name}`,
        });
      }
    }
  }

  return result;
}
