import { EllipsisVertical, Lock, LockOpen, Pencil, Trash2 } from 'lucide-react';
import { useState } from 'react';

import { useUpdateCategory } from '@/features/cost-centers/api/categories';
import { AddCategory } from '@/features/cost-centers/components/add-category';
import { CategoryModal } from '@/features/cost-centers/components/category-modal';
import { CategoryTile } from '@/features/cost-centers/components/category-tile';
import { afterClose } from '@/features/cost-centers/components/close-then';
import { ConfirmDeletion } from '@/features/cost-centers/components/confirm-deletion';
import { type CategoryTree } from '@/shared/api/categories';
import { t } from '@/shared/lib/i18n';
import { cn } from '@/shared/lib/utils';
import { Card, CardContent } from '@/shared/ui/atoms/card';
import { CollapsibleHeader } from '@/shared/ui/atoms/collapsible-header';
import { Menu, MenuOption } from '@/shared/ui/molecules/menu';

interface CostCenterCardProps {
  costCenter: CategoryTree;
  tree: CategoryTree[];
}

/** A cost center: its header row and, when expanded, its categories. */
export function CostCenterCard({ costCenter, tree }: CostCenterCardProps) {
  const [isExpanded, setIsExpanded] = useState(true);
  const [isConfirming, setIsConfirming] = useState(false);
  const [isEditing, setIsEditing] = useState(false);

  return (
    <Card>
      <CardContent className="p-0">
        {/*
          The highlight goes on the ROW, not on the button.

          Put on the button, it stopped just before the kebab —which is outside
          it so that pressing it does not expand the cost center— and left a piece
          unlit. And since the button is rectangular, its square corners
          peeked out over the rounded ones of the card.
        */}
        <div
          className={cn(
            'flex items-center gap-2 pr-3 transition-colors hover:bg-muted sm:pr-4',
            'rounded-t-lg',
            // Collapsed, the row IS the card: it is rounded at the bottom too.
            !isExpanded && 'rounded-b-lg',
          )}
        >
          <ExpandToggle
            costCenter={costCenter}
            isExpanded={isExpanded}
            onToggle={() => setIsExpanded((wasExpanded) => !wasExpanded)}
          />

          {/* Outside the button that expands: inside, pressing it would open the cost center
              as well as opening the menu, because the click reaches both. */}
          <CostCenterMenu
            costCenter={costCenter}
            onEdit={() => setIsEditing(true)}
            onDelete={() => setIsConfirming(true)}
          />
        </div>

        <ConfirmDeletion
          category={costCenter}
          level="costCenter"
          tree={tree}
          isOpen={isConfirming}
          onClose={() => setIsConfirming(false)}
        />

        <CategoryModal
          level="costCenter"
          category={isEditing ? costCenter : null}
          isOpen={isEditing}
          onClose={() => setIsEditing(false)}
        />

        {isExpanded && <CostCenterBody costCenter={costCenter} tree={tree} />}
      </CardContent>
    </Card>
  );
}

function ExpandToggle({
  costCenter,
  isExpanded,
  onToggle,
}: {
  costCenter: CategoryTree;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const categories = costCenter.children ?? [];
  const concepts = categories.reduce((n, g) => n + (g.children?.length ?? 0), 0);

  return (
    <CollapsibleHeader isOpen={isExpanded} onToggle={onToggle}>
      <span className="min-w-0 flex-1">
        <span className="flex min-w-0 items-center gap-2">
          {/* `text-lg` and not `text-xl`: the name of a cost center is the
              title of a card, and at 20px it competed with the title of
              the screen, which measures 24. */}
          <span className="truncate text-lg font-semibold">{costCenter.name}</span>
          {/* The padlock and not the word "estático": it is a state of the
              cost center, and in a list it is recognized sooner by its shape than
              by reading a label on every row. */}
          {costCenter.isStatic && (
            <Lock
              className="size-4 shrink-0 text-muted-foreground"
              aria-label={t('centers.card.static')}
            />
          )}
        </span>
        <span className="block text-xs text-muted-foreground">
          {t('centers.card.categoriesCount', {
            categories: categories.length,
            concepts,
          })}
        </span>
      </span>
    </CollapsibleHeader>
  );
}

function CostCenterMenu({
  costCenter,
  onEdit,
  onDelete,
}: {
  costCenter: CategoryTree;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const update = useUpdateCategory();

  return (
    <Menu
      label={t('centers.card.actionsOf', { name: costCenter.name })}
      Icon={EllipsisVertical}
      isIconOnly
      variant="ghost"
    >
      {(close) => (
        <>
          {/* Rename. It did not exist by any route: a cost center with a
              misspelled name had to be deleted entirely —with its
              categories and its concepts— and built again. */}
          <MenuOption Icon={Pencil} onClick={afterClose(close, onEdit)}>
            {t('common.edit')}
          </MenuOption>

          {/* Being able to change it afterward, not only when creating it: the cost centers that
              already existed were born before this existed. It stays
              here as well as in the form because it is a single click. */}
          <MenuOption
            Icon={costCenter.isStatic ? LockOpen : Lock}
            onClick={afterClose(close, () =>
              update.mutate({ id: costCenter.id, changes: { isStatic: !costCenter.isStatic } }),
            )}
          >
            {costCenter.isStatic ? t('centers.card.makeDynamic') : t('centers.card.makeStatic')}
          </MenuOption>
          <MenuOption Icon={Trash2} isDestructive onClick={afterClose(close, onDelete)}>
            {t('common.delete')}
          </MenuOption>
        </>
      )}
    </Menu>
  );
}

function CostCenterBody({ costCenter, tree }: { costCenter: CategoryTree; tree: CategoryTree[] }) {
  const categories = costCenter.children ?? [];

  /* The slot for the next category. It is declared here because it goes in two places
     —inside the columns when there are categories, loose when there are none— and they are the
     same button with the same texts: written twice, changing one and
     forgetting the other is a matter of time. */
  const gap = <AddCategory parentId={costCenter.id} isAlone={categories.length === 0} />;

  return (
    <div className="border-t border-border p-3 sm:p-4">
      {/*
        ── Masonry, not a grid ─────────────────────────────────────────
        The categories were stacked rows, and a full-width row with
        four chips inside leaves three quarters of its line
        blank: in a cost center with six categories one had to go through half a
        screen of emptiness to read them. In columns they are all seen at a
        glance, which is what one comes to do on this screen.

        But a GRID aligns by ROWS, and there is no good way out of that: either
        it stretches every card to the height of the tallest —and a category with
        twelve concepts inflates the other four in its row—, or each one
        measures its own and each row ends at a different step. What
        there was was the third way out: fixed height and scrolling the concepts
        that did not fit. That one hides behind a gesture precisely what
        one comes to read.

        Masonry has no rows. Each card is placed below
        the previous one in ITS column, so it measures exactly what it has
        inside: none inflates anyone, there is nothing to scroll and no
        gap is left between one and the next.

        ── CSS columns, and not grid masonry ───────────────────────────
        `grid-template-rows: masonry` is still behind a flag in a
        single browser. Multiple columns do this same thing, without a
        line of JavaScript, in all of them.

        What changes with them is the ORDER: it reads downward by
        columns, not from left to right. For a listing of categories
        —where one looks for a name, not the n-th place— it is the path
        of a list, repeated alongside.

        ── The column cap ──────────────────────────────────────────────
        1 on a phone, 2 from a tablet, 3 on a small laptop,
        4 on a large one and 5 from a monitor up.

        A minimum width —`minmax(17rem, 1fr)`, which is what there was— has
        no ceiling: on a 27-inch monitor EIGHT cards of
        288px came out in a row, a wall of narrow tiles where one cannot
        tell one from another. What is needed is not «no smaller
        than this» but «no more of these per row»: what breaks as the
        screen grows is not the size of the card, it is how many
        fit before the row stops being readable.

        And the width of a card is that of its column, so it does not depend
        on how many there are: two categories look the same size as twelve.
      */}
      {categories.length > 0 && (
        /* No negative margin to offset the `mb-3` of the last
           card of each column.

           It is what is always done in a column masonry, and
           here it does not work: the margin at the end of a column is discarded
           when the column ends at a BREAK, but it is kept when
           the content ends. Which of the two things happens in the tallest
           column —which is the one that sets the height of the block— depends on
           how many cards there are and how tall each one is, so a
           `-mb-3` gets it right with some data and eats twelve pixels of the
           card's padding with others.

           With the «Agregar categoría» slot closing the block, at the very
           bottom there is no margin to offset: the card's
           padding is what it says it is, always. */
        <div className="columns-1 gap-3 sm:columns-2 lg:columns-3 xl:columns-4 2xl:columns-5">
          {categories.map((category) => (
            <CategoryTile key={category.id} category={category} tree={tree} />
          ))}
        </div>
      )}

      {/*
        The slot for the next category goes OUTSIDE the columns, full
        width and below everything.

        Inside it was one more piece of the masonry, and there it does not work: the
        masonry ends in a ragged edge —each column ends
        where its last card ends— so the slot fell at the foot of
        any column, at a height that changes every time a
        concept is added. A place that moves is a place one has to
        look for.

        Full width and at the end it is always where the
        cost center finishes being read, and it caps the ragged edge with a straight line.
      */}
      {gap}
    </div>
  );
}
