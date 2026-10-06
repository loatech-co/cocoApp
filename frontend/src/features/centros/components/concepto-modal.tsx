import { Loader2, Merge, Trash2 } from 'lucide-react';
import { useState } from 'react';

import { useConceptForm } from '@/features/centros/hooks/use-concept-form';
import { findTwin, siblingCategories } from '@/features/centros/model/concept-form';
import { useCategories } from '@/shared/api/categories';
import { type Category } from '@/shared/api/generated/model';
import { t } from '@/shared/lib/i18n';
import { Block } from '@/shared/ui/atoms/block';
import { Button } from '@/shared/ui/atoms/button';
import { Field } from '@/shared/ui/atoms/field';
import { Input } from '@/shared/ui/atoms/input';
import { ModalFooter } from '@/shared/ui/molecules/modal-parts';
import { Modal } from '@/shared/ui/organisms/modal';
import { Select } from '@/shared/ui/organisms/select';

import { CamposDePalabrasClave } from './campos-de-palabras-clave';
import { CamposDeRecurrencia } from './campos-de-recurrencia';
import { ConfirmarBorrado } from './confirmar-borrado';

interface ConceptoModalProps {
  abierta: boolean;
  /** Sin concepto, el formulario crea dentro de `categoríaId`. Con él, edita. */
  concepto?: Category | null;
  categoriaId?: number;
  onCerrar: () => void;
}

/**
 * Crear o renombrar un concepto, y decir si se paga cada cierto tiempo.
 *
 * ── Por qué solo los conceptos ──────────────────────────────────────────────
 * Un centro de costos y una categoría no se pagan: son sumas. Lo que tiene un
 * importe, una fecha y una periodicidad es el concepto —el alquiler, la
 * energía—, y es el único nivel donde la recurrencia significa algo.
 *
 * ── Por qué el mismo formato que el de movimientos ──────────────────────────
 * Porque es la misma clase de acto: abrir una ficha, cambiar unos campos,
 * guardar. Dos formularios distintos para lo mismo obligan a aprender dos
 * veces dónde está el botón de guardar.
 */
export function ConceptoModal({ abierta, concepto, categoriaId, onCerrar }: ConceptoModalProps) {
  const categorias = useCategories();
  const form = useConceptForm({ abierta, concepto, categoriaId, onCerrar });
  const [confirmando, setConfirmando] = useState(false);

  if (!abierta) return null;

  const arbol = categorias.data ?? [];
  const gemelo = findTwin(arbol, concepto, form.nombre);

  return (
    <>
      <Modal
        isOpen={abierta}
        title={concepto ? t('centers.conceptModal.editTitle') : t('centers.conceptModal.newTitle')}
        description={t('centers.conceptModal.help')}
        // Eliminar va en la cabecera, al lado de la equis: es la otra acción
        // de la ficha que no es "guardar".
        actions={
          concepto && (
            <DeleteConceptButton concepto={concepto} onClick={() => setConfirmando(true)} />
          )
        }
        onClose={onCerrar}
      >
        <ConceptForm
          form={form}
          concepto={concepto}
          arbol={arbol}
          gemelo={gemelo}
          onCerrar={onCerrar}
        />
      </Modal>

      {concepto && (
        <ConfirmarBorrado
          categoria={concepto}
          nivel="concepto"
          arbol={arbol}
          abierta={confirmando}
          onCerrar={() => setConfirmando(false)}
          // Sin el concepto, esta ficha no tiene de qué hablar.
          onEliminada={onCerrar}
        />
      )}
    </>
  );
}

function DeleteConceptButton({ concepto, onClick }: { concepto: Category; onClick: () => void }) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm-icon"
      onClick={onClick}
      aria-label={t('centers.conceptModal.deleteNamed', { name: concepto.name })}
      title={t('centers.conceptModal.delete')}
      className="text-muted-foreground hover:text-destructive"
    >
      <Trash2 className="size-4" aria-hidden="true" />
    </Button>
  );
}

interface ConceptFormProps {
  form: ReturnType<typeof useConceptForm>;
  concepto: Category | null | undefined;
  arbol: Category[];
  gemelo: Category | undefined;
  onCerrar: () => void;
}

function ConceptForm({ form, concepto, arbol, gemelo, onCerrar }: ConceptFormProps) {
  const hermanos = siblingCategories(arbol, concepto);

  return (
    <form onSubmit={(e) => void form.onSubmit(e)} className="flex flex-1 flex-col gap-4">
      <Field label={t('common.name')} id="concepto-nombre">
        <Input
          id="concepto-nombre"
          value={form.nombre}
          onChange={(e) => form.setNombre(e.target.value)}
          placeholder={t('centers.conceptModal.namePlaceholder')}
          required
        />
      </Field>

      {/* Solo al editar: al crear, la categoría es aquella cuyo botón se pulsó
          para abrir esto, así que preguntarlo otra vez es preguntar por
          algo que se acaba de decir. */}
      {concepto && hermanos.length > 1 && <SiblingCategoryField form={form} hermanos={hermanos} />}

      <CamposDeRecurrencia valor={form.recurrencia} onCambiar={form.setRecurrencia} />

      {/*
        Después de la recurrencia y no antes del nombre.

        Lo que se viene a hacer a esta ficha es crear o corregir un
        concepto; que sus recibos se lean solos es lo que se hace DESPUÉS,
        y la primera vez casi nunca —no se sabe qué dice el recibo hasta
        que llega—. Arriba obligaría a pasar por encima de un campo que la
        mayoría de las veces se deja vacío.
      */}
      <CamposDePalabrasClave
        valor={form.palabrasClave}
        onCambiar={form.setPalabrasClave}
        arbol={arbol}
        conceptoId={concepto?.id}
      />

      {gemelo && <TwinNotice gemelo={gemelo} concepto={concepto} form={form} />}

      {form.error && (
        <p role="alert" className="text-sm text-destructive">
          {form.error}
        </p>
      )}

      <ConceptFormFooter
        form={form}
        editando={concepto != null}
        bloqueado={gemelo !== undefined}
        onCerrar={onCerrar}
      />
    </form>
  );
}

function TwinNotice({
  gemelo,
  concepto,
  form,
}: {
  gemelo: Category;
  concepto: Category | null | undefined;
  form: ReturnType<typeof useConceptForm>;
}) {
  return (
    /*
      Superficie neutra, no ámbar.

      El ámbar es para lo que está PENDIENTE —un movimiento sin
      clasificar, un pago que vence—. Esto no está pendiente ni salió
      mal: es una salida que se ofrece. Y en oscuro, además, el
      `warning-surface` es un marrón que sobre el verde del modal daba
      un verde oliva sucio.
    */
    <Block className="flex flex-col gap-3">
      <p className="text-sm text-muted-foreground">
        <strong className="font-semibold text-foreground">
          {t('centers.conceptModal.duplicateBefore', { name: gemelo.name })}
        </strong>
        {t('centers.conceptModal.duplicateMiddle')}
        {concepto
          ? t('centers.conceptModal.duplicateDisappears', { name: concepto.name })
          : t('centers.conceptModal.duplicateNoNew')}
        .
      </p>
      {concepto && (
        <Button
          type="button"
          variant="tool"
          size="sm"
          className="self-start"
          disabled={form.guardando}
          onClick={() => void form.onUnificar(gemelo.id)}
        >
          <Merge className="size-4" aria-hidden="true" />
          {t('centers.conceptModal.mergeWith', { name: gemelo.name })}
        </Button>
      )}
    </Block>
  );
}

function ConceptFormFooter({
  form,
  editando,
  bloqueado,
  onCerrar,
}: {
  form: ReturnType<typeof useConceptForm>;
  editando: boolean;
  /** Hay otro concepto con el mismo nombre: se unifica, no se guarda. */
  bloqueado: boolean;
  onCerrar: () => void;
}) {
  return (
    <ModalFooter>
      <Button type="button" variant="outline" onClick={onCerrar}>
        {t('common.cancel')}
      </Button>
      <Button type="submit" disabled={form.guardando || form.nombre.trim() === '' || bloqueado}>
        {form.guardando && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
        {editando ? t('common.save') : t('common.create')}
      </Button>
    </ModalFooter>
  );
}

function SiblingCategoryField({
  form,
  hermanos,
}: {
  form: ReturnType<typeof useConceptForm>;
  hermanos: { value: string; label: string }[];
}) {
  return (
    <Field
      label={t('centers.levels.category')}
      id="concepto-categoria"
      description={t('centers.conceptModal.categoryHelp')}
    >
      <Select
        id="concepto-categoria"
        label={t('centers.levels.category')}
        value={form.categoria}
        options={hermanos}
        onChange={form.setCategoría}
      />
    </Field>
  );
}
