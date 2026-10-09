import { EllipsisVertical, Pencil, Plus, Repeat, Trash2 } from 'lucide-react';
import { useState } from 'react';

import { CategoryModal } from '@/features/cost-centers/components/category-modal';
import { afterClose } from '@/features/cost-centers/components/close-then';
import { ConceptModal } from '@/features/cost-centers/components/concept-modal';
import { ConfirmDeletion } from '@/features/cost-centers/components/confirm-deletion';
import { type CategoryTree } from '@/shared/api/categories';
import { t } from '@/shared/lib/i18n';
import { cn } from '@/shared/lib/utils';
import { Chip } from '@/shared/ui/atoms/badge';
import { Block } from '@/shared/ui/atoms/block';
import { CategoryIcon } from '@/shared/ui/atoms/icons';
import { Menu, MenuOption } from '@/shared/ui/molecules/menu';

/**
 * What makes a card a piece of the masonry.
 *
 * ── Why `break-inside-avoid` is not optional ────────────────────────────────
 * Without it, a card that does not fit whole at the foot of its column SPLITS: the
 * title and two concepts at the very bottom, the rest at the top of the next one, and
 * no border to close or to open. It is the declaration that turns a
 * text in columns into a pile of tiles.
 *
 * ── And why the gap below is a margin and not the `gap` ─────────────────────
 * Because in a columns container `gap` is only the gap BETWEEN COLUMNS.
 * What separates a card from the one below is set by nobody, and without a margin
 * they end up stuck together. Twelve pixels, the same as the `gap-3` alongside, so that the
 * separation reads the same in both directions.
 */
const TILE = 'mb-3 break-inside-avoid';

interface CategoryTileProps {
  category: CategoryTree;
  tree: CategoryTree[];
}

export function CategoryTile({ category, tree }: CategoryTileProps) {
  const [isEditing, setIsEditing] = useState<CategoryTree | null>(null);
  const [isRenaming, setIsRenaming] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);
  const concepts = category.children ?? [];

  return (
    /* `pt` shorter than the rest of the padding: at the top of the card the
       kebab rules, which is a 36 button with a 16 icon inside, and those ten
       pixels of its own air add to those of the border. With even padding,
       the title looked sunken. */
    <Block className={cn('pt-2 sm:p-4 sm:pt-2.5', TILE)}>
      <div className="flex items-center justify-between gap-2">
        <CategoryName category={category} />
        {/* The same menu as on the cost center: a loose icon has nowhere to be
            pressed —on a phone one has to hit 16px— and it does not look like
            something pressable until one tries it. */}
        {/*
          The kebab gets closer to the edge with a NEGATIVE margin, not by shrinking it.

          Its target is 36px for a pointer and 42 for a finger, and the icon is 16: the
          ten of air left around it added to those of the border of the
          card and the icon ended up twenty-six pixels from the corner,
          floating. Trimming the button would fix the look and break
          the target, which is what has to be hit with the thumb.

          With the margin negative the button still measures the same —it can be
          pressed the same— and what moves is where it is drawn inside
          it. The touch area eats the card's padding, which is dead
          space anyway.
        */}
        <CategoryMenu
          name={category.name}
          onAdd={() => setIsCreating(true)}
          onEdit={() => setIsRenaming(true)}
          onDelete={() => setIsConfirming(true)}
        />
      </div>

      {/*
        No box to scroll them and no height to fill: the card measures what
        they have.

        They were inside an `overflow-y-auto` with `flex-1`, which was what
        held the fixed height of the grid: twelve concepts scrolled
        inside their card instead of costing the neighbors a centimeter.
        In masonry there is no need to pay that price —a tall card does not
        inflate anyone— and scrolling hid behind a gesture precisely what
        one comes to read on this screen.
      */}
      {concepts.length > 0 && <ConceptList concepts={concepts} onEdit={setIsEditing} />}

      <ConfirmDeletion
        category={category}
        level="category"
        tree={tree}
        isOpen={isConfirming}
        onClose={() => setIsConfirming(false)}
      />

      <CategoryModal
        level="category"
        category={isRenaming ? category : null}
        isOpen={isRenaming}
        onClose={() => setIsRenaming(false)}
      />

      <ConceptModal
        isOpen={isEditing !== null}
        concept={isEditing}
        onClose={() => setIsEditing(null)}
      />
      <ConceptModal
        isOpen={isCreating}
        categoryId={category.id}
        onClose={() => setIsCreating(false)}
      />
    </Block>
  );
}

/*
  The icon to the LEFT of the name, not above it nor inside a pastel.

  It is what makes a grid of twelve categories be scanned by looking instead
  of by reading: the shape is recognized before the word. To the
  left because that is where the row starts being read, and the same
  size as the text —not a big ornament— because it accompanies the name,
  it does not replace it.

  A category without an icon leaves no reserved slot: `CategoryIcon`
  returns nothing and the name starts where it started before. An empty
  slot aligned with the ones that do have an icon looks like an icon that
  did not load.
*/
function CategoryName({ category }: { category: CategoryTree }) {
  return (
    <h3 className="flex min-w-0 items-center gap-2 text-sm font-semibold">
      <CategoryIcon name={category.icon} className="size-4 shrink-0 text-muted-foreground" />
      <span className="min-w-0 truncate">{category.name}</span>
    </h3>
  );
}

function CategoryMenu({
  name,
  onAdd,
  onEdit,
  onDelete,
}: {
  name: string;
  onAdd: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <Menu
      label={t('centers.tile.actionsOf', { name })}
      Icon={EllipsisVertical}
      isIconOnly
      variant="ghost"
      boxClassName="-my-1 -mr-1.5 sm:-mr-2"
    >
      {(close) => (
        <>
          {/* The FIRST thing in the menu: it is what is done most with a category.
              Delete goes at the end and in red, because it is what is done least. */}
          <MenuOption Icon={Plus} onClick={afterClose(close, onAdd)}>
            {t('centers.tile.addConcept')}
          </MenuOption>

          {/* Renaming a category did not exist by any route, same as on
              the cost center: the only way out was to delete it with its concepts
              inside and type them again. */}
          <MenuOption Icon={Pencil} onClick={afterClose(close, onEdit)}>
            {t('common.edit')}
          </MenuOption>
          <MenuOption Icon={Trash2} isDestructive onClick={afterClose(close, onDelete)}>
            {t('common.delete')}
          </MenuOption>
        </>
      )}
    </Menu>
  );
}

function ConceptList({
  concepts,
  onEdit,
}: {
  concepts: CategoryTree[];
  onEdit: (concept: CategoryTree) => void;
}) {
  return (
    <ul className="mt-3 flex flex-wrap gap-1.5">
      {concepts.map((concept) => (
        <li key={concept.id}>
          {/* They open for editing: renaming and saying whether they pay themselves.
                Before they were dead text, and the only way to correct a
                misspelled name was to delete the concept and create it again
                —with which the transactions were left unclassified—. */}
          {/* The shared `Chip`, which brings its shape and its padding.
                 Written by hand it was a `bg-card` inside a `muted` box
                 inside a `card` card, and that step goes in opposite
                 directions depending on the theme: the chip rose in light and
                 sank in dark. */}
          {/* `max-w-full` and the name truncated: in a 17rem card,
                a concept with a long name made a chip wider than its
                card and it spilled out the side. */}
          <Chip
            onClick={() => onEdit(concept)}
            title={t('centers.tile.editConcept', { name: concept.name })}
            className="max-w-full"
          >
            {concept.isRecurring && (
              <Repeat
                className="size-3 shrink-0 opacity-70"
                aria-label={t('centers.tile.recurring')}
              />
            )}
            <span className="min-w-0 truncate">{concept.name}</span>
          </Chip>
        </li>
      ))}
    </ul>
  );
}
