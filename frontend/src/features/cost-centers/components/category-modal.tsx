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

/** Without accents or capitals: «Educación» is found by typing «educacion». */
function normal(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

/**
 * The fifty icons, with a filter.
 *
 * ── Why the filter is needed ────────────────────────────────────────────────
 * Without it the grid was fifty drawings in a box that shows twenty-three:
 * the rest had to be discovered by scrolling, without knowing they were there or
 * how many were left. And it is not a hypothetical problem —the one for «Educación» was
 * number twenty-three, right at the fold—.
 *
 * Typing three letters leaves two or three icons and one picks by looking, which is
 * what an icon exists for. It filters by the Spanish NAME and not by the
 * lucide one: whoever looks for an icon for Educación types «educación», not
 * «graduation cap».
 *
 * ── Why it can be removed ───────────────────────────────────────────────────
 * Because a category without an icon is a legitimate case —there are some that do not look like
 * any drawing— and without a way to go back, the first icon someone
 * presses out of curiosity stays there forever.
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
   * What is being touched. It changes the title, the help and whether the
   * switch shows up: the static flag is read from the COST CENTER, which is the level above, and
   * a category inherits whatever its own says.
   */
  level: 'costCenter' | 'category';
  /** With a category, it edits. Without one, it creates. */
  category?: Category | null;
  /** When creating a category, which cost center it hangs from. */
  parentId?: number;
  onClose: () => void;
}

/**
 * Create or edit a cost center.
 *
 * ── Why in a form and not on the screen itself ──────────────────────────────
 * Because creating a cost center is done two or three times in the life of an account, and
 * the form took up the whole first screen every other day. What
 * is looked at here daily is the structure that already exists; creating is an
 * exception, and exceptions go behind a button.
 *
 * ── Why creating and editing are the SAME form ──────────────────────────────
 * Because the fields are the same —the name and whether it is static— and the only
 * difference is where their initial values come from. Two forms drift apart:
 * one learns a new field and the other does not, and then there are things that can only
 * be set when creating.
 *
 * And editing was needed: cost centers and categories could not be renamed from
 * anywhere. A misspelled name forced deleting the whole cost center —with
 * its categories and its concepts— and building it again.
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
          The icon picker, only on categories.

          It is not on cost centers because there it is not shown: the row of a cost center already
          carries its expand arrow to the left of the name, and a second
          symbol next to it would be an icon competing with a control.

          And it is a GRID and not a dropdown: fifty icons in a list
          have to be opened, scrolled through and closed; open all at once they are
          recognized by looking, which is what an icon exists for. It takes four
          rows of eight, with its own scrolling so as not to stretch the form.
        */}
        {!isCostCenter && <IconPicker value={icon} onSelect={setIcon} />}

        {/*
          The switch on the RIGHT and inside a box.

          Loose and on the left it was left floating between two fields, with three
          lines of small print hanging beside it: it read like a
          footnote and not like the control it is. The box turns it into a settings
          row —name on one side, state on the other— which is the way a
          switch is already read anywhere.

          The label wraps both things, so the whole text is
          pressable: on a phone that is the difference between hitting it and not.

          And the explanation, short. The long why —that fixed costs are not
          improvised, that a distracted click moves money without anyone noticing—
          lives in the code, not in the form.
        */}
        {/* Only on cost centers: the static flag is read from the level above, and a
            category inherits whatever its own says. Offering it on a category would be a
            switch that does nothing. */}
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
