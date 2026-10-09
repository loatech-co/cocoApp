import { useState } from 'react';

import { CategoryModal } from '@/features/cost-centers/components/category-modal';
import { t } from '@/shared/lib/i18n';
import { AddSurface } from '@/shared/ui/atoms/add-surface';

/**
 * The slot for the next category: one more tile of the grid.
 *
 * ── Why a dashed box and not a link ─────────────────────────────────────────
 * Because it takes a cell in the same grid as the categories and with their same
 * shape: it reads as the place of the next one, not as an action somewhere else on
 * the card. And the dashed border is what everywhere means «something
 * that is not here yet fits here» —it is the same language as the slot for a
 * receipt and the one for a shortcut—.
 *
 * ── Why the field shows up when asked for ───────────────────────────────────
 * Having twenty fields open at once is overwhelming: on a screen with six
 * cost centers there would be six empty text boxes competing with the structure that
 * one comes to read.
 */
/**
 * The slot for the next category.
 *
 * ── Why a dashed box and not a link ─────────────────────────────────────────
 * Because the dashed border is what everywhere means «something
 * that is not here yet fits here» —the same language as the slot for a receipt and the one for
 * a shortcut—, and that reads as the place of the next category, not as an action
 * loose somewhere else on the card.
 *
 * ── Why it opens the form and no longer a loose field ───────────────────────
 * It had its own inline form: a field for the name and two buttons.
 * That way, creating a category and editing it were two different forms for the same
 * thing, and the create one did not ask for the icon —which is half of what makes a
 * category recognizable in the grid—. The result is that every category was born without
 * an icon and one had to open the form right after to give it one.
 *
 * With the same form in both cases, what is asked when creating is exactly
 * what can be changed when editing. And along the way the only field on the
 * screen that was born focused disappears.
 */
export function AddCategory({
  parentId,
  isAlone = false,
}: {
  /** Which cost center the category about to be created hangs from. */
  parentId: number;
  /** With no category yet: the slot is the only thing in the cost center. */
  isAlone?: boolean;
}) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <div className={isAlone ? undefined : 'mt-3'}>
        <AddSurface shape={isAlone ? 'slot' : 'bar'} onClick={() => setIsOpen(true)}>
          {t('centers.addCategory')}
        </AddSurface>
      </div>

      <CategoryModal
        level="category"
        parentId={parentId}
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
      />
    </>
  );
}
