import type { MovementSheetState } from '@/features/transactions/hooks/use-movement-form';
import { rutaSeleccionada } from '@/features/transactions/model/movimientos';
import { nombreDelOrigen } from '@/features/transactions/model/precedencia';
import { type CategoryTree } from '@/shared/api/categories';
import { t } from '@/shared/lib/i18n';
import { Field } from '@/shared/ui/atoms/field';
import { TextButton } from '@/shared/ui/atoms/text-button';
import { Combo } from '@/shared/ui/organisms/combo';

import { BuscadorDeConcepto } from './buscador-de-concepto';

interface ClassificationProps {
  ficha: MovementSheetState;
  arbol: CategoryTree[];
  /** El centro GUARDADO es estático: ni el buscador ni la cascada se mueven. */
  estatico: boolean;
  crearDentro: (nombre: string, padreId: number | undefined) => Promise<void>;
  creando: boolean;
}

/** Lo que el buscador dice debajo: de dónde salió lo que hay puesto. */
function searchHelp(ficha: MovementSheetState): string | undefined {
  const { clasificacion, categoryId, candidatosDelRecibo } = ficha;
  if (clasificacion.origen && clasificacion.origen !== 'manual' && categoryId !== undefined) {
    return t('transactions.classification.canChange', {
      origin: nombreDelOrigen(clasificacion.origen).replace(/^\w/, (c) => c.toUpperCase()),
    });
  }
  return candidatosDelRecibo.length > 0 && clasificacion.origen !== 'manual'
    ? t('transactions.classification.severalConcepts')
    : undefined;
}

/**
 * ── Un solo buscador para clasificar ────────────────────────────────────────
 * Se escribe «d1» y aparece «Mercado · Alimentación › Costos variables»: un
 * clic y los tres niveles quedan puestos. La cascada de centro, categoría y
 * concepto sigue ahí, detrás del enlace de abajo, para quien quiera ir nivel a
 * nivel; pero ya no es la puerta.
 *
 * Lo que el buscador dice debajo —«sugerido por tu historial»— es la regla de
 * no guardar nunca una clasificación sugerida sin que la persona la vea.
 *
 * ── Los tres se bloquean si el centro GUARDADO es estático ──────────────────
 * Esta regla estaba y se perdió al rediseñar la ficha: los desplegables
 * pasaron a bloquearse solo por dependencia —«elige antes un centro»— y el
 * estático dejó de contar, así que un movimiento de Costos fijos se podía
 * reclasificar desde aquí aunque la tabla no lo permitiera. La misma plata se
 * movía o no según por dónde se entrara.
 *
 * Lo que protege un centro estático es su estructura. Borrar el movimiento sí
 * se puede —eso es el registro, no la estructura—; moverlo de concepto, no.
 */
export function MovementClassification({
  ficha,
  arbol,
  estatico,
  crearDentro,
  creando,
  recientes,
}: ClassificationProps & { recientes: readonly number[] }) {
  return (
    <>
      <BuscadorDeConcepto
        id="mov-concepto"
        arbol={arbol}
        valor={ficha.categoryId}
        deshabilitado={estatico}
        onElegir={(id) => ficha.proponer({ categoryId: id, origen: 'manual' })}
        onCrearConcepto={(nombre, categoriaId) => void crearDentro(nombre, categoriaId)}
        creando={creando}
        recientes={recientes}
        candidatos={ficha.candidatosDelRecibo}
        ayuda={searchHelp(ficha)}
      />

      {!estatico && (
        // -mt-3 y no -mt-2: el botón mide 24 y su letra 16, así que el texto
        // queda donde estaba.
        <div className="-mt-3 flex self-start">
          <TextButton tone="subtle" onClick={() => ficha.setCascadaVisible((v) => !v)}>
            {ficha.cascadaVisible
              ? t('transactions.classification.hidePicker')
              : t('transactions.classification.showPicker')}
          </TextButton>
        </div>
      )}

      {(ficha.cascadaVisible || estatico) && (
        <ClassificationCascade
          ficha={ficha}
          arbol={arbol}
          estatico={estatico}
          crearDentro={crearDentro}
          creando={creando}
        />
      )}
    </>
  );
}

/**
 * La cascada de siempre: de qué centro, de qué categoría, qué concepto.
 *
 * El centro no ofrece crear: un centro es la estructura de arriba y se define
 * tres veces en la vida de una cuenta.
 */
function ClassificationCascade(props: ClassificationProps) {
  const { ficha, arbol, estatico, crearDentro, creando } = props;
  const { centro, categoria, concepto } = rutaSeleccionada(arbol, ficha.categoryId);
  const elegir = (id?: number): void => ficha.proponer({ categoryId: id, origen: 'manual' });

  return (
    <>
      <CostCenterField centro={centro} arbol={arbol} estatico={estatico} onElegir={elegir} />

      <Field label={t('centers.levels.category')} id="mov-categoria">
        <Combo
          id="mov-categoria"
          label={t('centers.levels.category')}
          value={categoria ? String(categoria.id) : ''}
          options={(centro?.children ?? []).map((g) => ({
            value: String(g.id),
            label: g.name,
          }))}
          disabled={estatico || !centro}
          emptyLabel={
            centro
              ? t('transactions.classification.notChosen')
              : t('transactions.classification.chooseCostCenterFirst')
          }
          isCreating={creando}
          onChange={(v) => elegir(v === '' ? centro?.id : Number(v))}
          onCreate={(nombre) => void crearDentro(nombre, centro?.id)}
        />
      </Field>

      <Field label={t('transactions.fields.concept')} id="mov-concepto-cascada">
        <Combo
          id="mov-concepto-cascada"
          label={t('transactions.fields.concept')}
          value={concepto ? String(concepto.id) : ''}
          options={(categoria?.children ?? []).map((c) => ({
            value: String(c.id),
            label: c.name,
          }))}
          disabled={estatico || !categoria}
          emptyLabel={
            categoria
              ? t('transactions.classification.notChosen')
              : t('transactions.classification.chooseCategoryFirst')
          }
          isCreating={creando}
          onChange={(v) => elegir(v === '' ? categoria?.id : Number(v))}
          onCreate={(nombre) => void crearDentro(nombre, categoria?.id)}
        />
      </Field>
    </>
  );
}

/** El centro de costos. No ofrece crear: es la estructura de arriba. */
function CostCenterField({
  centro,
  arbol,
  estatico,
  onElegir,
}: {
  centro: CategoryTree | undefined;
  arbol: CategoryTree[];
  estatico: boolean;
  onElegir: (id?: number) => void;
}) {
  return (
    <Field label={t('centers.levels.costCenter')} id="mov-centro">
      <Combo
        id="mov-centro"
        label={t('centers.levels.costCenter')}
        value={centro ? String(centro.id) : ''}
        options={arbol.map((c) => ({ value: String(c.id), label: c.name }))}
        disabled={estatico}
        onChange={(v) => onElegir(v === '' ? undefined : Number(v))}
      />
    </Field>
  );
}
