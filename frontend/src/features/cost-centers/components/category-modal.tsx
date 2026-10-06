import { Loader2 } from 'lucide-react';
import { useMemo, useState } from 'react';

import { useCategoryForm } from '@/features/cost-centers/hooks/use-category-form';
import { categoryModalTexts } from '@/features/cost-centers/model/category-form';
import { type Category } from '@/shared/api/generated/model';
import { t } from '@/shared/lib/i18n';
import { cn } from '@/shared/lib/utils';
import { BLOCK } from '@/shared/ui/atoms/block';
import { Button } from '@/shared/ui/atoms/button';
import { Field } from '@/shared/ui/atoms/field';
import { CATEGORY_ICONS } from '@/shared/ui/atoms/icons';
import { Input } from '@/shared/ui/atoms/input';
import { SearchBox } from '@/shared/ui/atoms/search-box';
import { Switch } from '@/shared/ui/atoms/switch';
import { IconGrid } from '@/shared/ui/molecules/icon-grid';
import { ModalFooter } from '@/shared/ui/molecules/modal-parts';
import { Modal } from '@/shared/ui/organisms/modal';

/** Sin tildes ni mayúsculas: «Educación» se encuentra escribiendo «educacion». */
function normal(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

/**
 * Los cincuenta iconos, con un filtro.
 *
 * ── Por qué hace falta el filtro ────────────────────────────────────────────
 * Sin él la rejilla era cincuenta dibujos en una caja que enseña veintitrés:
 * el resto había que descubrirlo desplazando, sin saber que estaban ahí ni
 * cuántos quedaban. Y no es un problema hipotético —el de «Educación» era el
 * número veintitrés, justo en el pliegue—.
 *
 * Escribiendo tres letras quedan dos o tres iconos y se elige mirando, que es
 * para lo que existe un icono. Filtra por el NOMBRE en castellano y no por el
 * de lucide: quien busca un icono para Educación escribe «educación», no
 * «graduation cap».
 *
 * ── Por qué se puede quitar ─────────────────────────────────────────────────
 * Porque una categoría sin icono es un caso legítimo —los hay que no se parecen a
 * ningún dibujo— y sin una forma de volver atrás, el primer icono que alguien
 * pulse por curiosidad se queda ahí para siempre.
 */
function IconPicker({
  value,
  onSelect,
}: {
  value: string | null;
  onSelect: (icon: string | null) => void;
}) {
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const q = normal(query);
    if (q === '') return CATEGORY_ICONS;
    return CATEGORY_ICONS.filter((i) => normal(i.label).includes(q));
  }, [query]);

  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-2 text-sm font-medium">{t('centers.categoryModal.icon')}</legend>

      <div className={cn(BLOCK, 'flex flex-col gap-2')}>
        <SearchBox
          shape="box"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t('centers.categoryModal.iconSearchPlaceholder')}
          aria-label={t('centers.categoryModal.iconSearch')}
        />

        <IconGrid icons={filtered} value={value} onSelect={onSelect} />
      </div>
    </fieldset>
  );
}

interface CategoryModalProps {
  isOpen: boolean;
  /**
   * Qué se está tocando. Cambia el título, la ayuda y si aparece el
   * interruptor: lo estático se lee del CENTRO, que es el nivel de arriba, y
   * una categoría hereda lo que diga el suyo.
   */
  level: 'costCenter' | 'category';
  /** Con una categoría, se edita. Sin ella, se crea. */
  category?: Category | null;
  /** Al crear una categoría, de qué centro cuelga. */
  parentId?: number;
  onClose: () => void;
}

/**
 * Crear o editar un centro de costos.
 *
 * ── Por qué en una ficha y no en la propia pantalla ─────────────────────────
 * Porque crear un centro se hace dos o tres veces en la vida de una cuenta, y
 * el formulario ocupaba la primera pantalla entera todos los demás días. Lo
 * que se mira aquí a diario es la estructura que ya existe; crear es una
 * excepción, y las excepciones van detrás de un botón.
 *
 * ── Por qué crear y editar son la MISMA ficha ───────────────────────────────
 * Porque los campos son los mismos —el nombre y si es estático— y la única
 * diferencia es de dónde salen sus valores iniciales. Dos fichas se separan:
 * una aprende un campo nuevo y la otra no, y entonces hay cosas que solo se
 * pueden poner al crear.
 *
 * Y editar hacía falta: los centros y las categorías no se podían renombrar desde
 * ningún sitio. Un nombre mal escrito obligaba a borrar el centro entero —con
 * sus categorías y sus conceptos— y volver a armarlo.
 */
export function CategoryModal({ isOpen, level, category, parentId, onClose }: CategoryModalProps) {
  const form = useCategoryForm({ isOpen, level, category, parentId, onClose });
  const { name, setName, icon, setIcon, error, isSaving } = form;
  const isEditing = category != null;
  const isCostCenter = level === 'costCenter';
  const { title, help } = categoryModalTexts(isCostCenter, isEditing);

  return (
    <Modal isOpen={isOpen} title={title} description={help} onClose={onClose}>
      <form onSubmit={(e) => void form.onSubmit(e)} className="flex flex-1 flex-col gap-4">
        <Field label={t('common.name')} id="categoria-nombre">
          <Input
            id="categoria-nombre"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t('centers.categoryModal.namePlaceholder')}
            maxLength={255}
            required
          />
        </Field>

        {/*
          El selector de icono, solo en las categorías.

          No está en los centros porque ahí no se ve: la fila de un centro ya
          lleva su flecha de desplegar a la izquierda del nombre, y un segundo
          símbolo al lado sería un icono compitiendo con un control.

          Y es una REJILLA y no un desplegable: cincuenta iconos en una lista
          hay que abrirla, recorrerla y cerrarla; abiertos a la vez se
          reconocen mirando, que es para lo que existe un icono. Ocupa cuatro
          filas de ocho, con su propio desplazamiento para no estirar la ficha.
        */}
        {!isCostCenter && <IconPicker value={icon} onSelect={setIcon} />}

        {/*
          El interruptor a la DERECHA y dentro de una caja.

          Suelto y a la izquierda quedaba flotando entre dos campos, con tres
          renglones de letra pequeña colgando a su lado: se leía como una nota
          al pie y no como el control que es. La caja lo vuelve una fila de
          ajustes —nombre a un lado, estado al otro— que es la forma en la que
          ya se lee un interruptor en cualquier parte.

          La etiqueta envuelve las dos cosas, así que el texto entero es
          pulsable: en un teléfono es la diferencia entre acertarle y no.

          Y la explicación, corta. El porqué largo —que los costos fijos no se
          improvisan, que un clic distraído mueve plata sin que nadie lo note—
          vive en el código, no en el formulario.
        */}
        {/* Solo en los centros: lo estático se lee del nivel de arriba, y un
            categoría hereda lo que diga el suyo. Ofrecerlo en una categoría sería un
            interruptor que no hace nada. */}
        {isCostCenter && <StaticSwitch isStatic={form.isStatic} onChange={form.setIsStatic} />}

        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}

        <CategoryFormFooter
          isEditing={isEditing}
          isSaving={isSaving}
          isDisabled={isSaving || name.trim() === ''}
          onClose={onClose}
        />
      </form>
    </Modal>
  );
}

function CategoryFormFooter({
  isEditing,
  isSaving,
  isDisabled,
  onClose,
}: {
  isEditing: boolean;
  isSaving: boolean;
  isDisabled: boolean;
  onClose: () => void;
}) {
  return (
    <ModalFooter>
      <Button type="button" variant="outline" onClick={onClose}>
        {t('common.cancel')}
      </Button>
      <Button type="submit" disabled={isDisabled}>
        {isSaving && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
        {isEditing ? t('common.save') : t('common.create')}
      </Button>
    </ModalFooter>
  );
}

function StaticSwitch({
  isStatic,
  onChange,
}: {
  isStatic: boolean;
  onChange: (isStatic: boolean) => void;
}) {
  return (
    <label className={cn(BLOCK, 'flex cursor-pointer items-center justify-between gap-4')}>
      <span className="min-w-0">
        <span className="block text-sm font-medium">{t('centers.categoryModal.static')}</span>
        <span className="mt-0.5 block text-xs text-muted-foreground">
          {t('centers.categoryModal.staticHelp')}
        </span>
      </span>
      <Switch checked={isStatic} onChange={(e) => onChange(e.target.checked)} />
    </label>
  );
}
