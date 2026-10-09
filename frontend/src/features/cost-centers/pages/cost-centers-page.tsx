import { CircleHelp, Plus } from 'lucide-react';
import { useState } from 'react';

import { CategoryModal } from '@/features/cost-centers/components/category-modal';
import { CostCenterCard } from '@/features/cost-centers/components/cost-center-card';
import { CostCentersHelp } from '@/features/cost-centers/components/cost-centers-help';
import { useCategories } from '@/shared/api/categories';
import { t } from '@/shared/lib/i18n';
import { ErrorAlert } from '@/shared/ui/atoms/alert';
import { Button } from '@/shared/ui/atoms/button';
import { Card, CardContent } from '@/shared/ui/atoms/card';
import { PageHeader } from '@/shared/ui/atoms/page-header';
import { Skeleton } from '@/shared/ui/atoms/skeleton';

/**
 * Cost centers.
 *
 * It is the screen where the SHAPE of the reports is defined, so it explains the
 * model instead of taking for granted that it is understood. Someone who opens this for
 * the first time has to come out knowing what a category is and why it exists.
 */
export function CostCentersPage() {
  const categories = useCategories();

  const [isCreating, setIsCreating] = useState(false);
  const [isHelpShown, setIsHelpShown] = useState(false);

  return (
    <div className="flex flex-col gap-4 sm:gap-5">
      {/* The button at the opposite end from the title, as in the rest of the app:
          it is the only action on the screen and it is always looked for in the same
          corner. */}
      <PageHeader
        title={t('shell.sections.costCenters')}
        description={t('centers.page.help')}
        /* The explanation is shown once and gets in the way every other time.
           Behind the question mark it is still there for whoever needs
           it, without taking up half the screen for whoever already read it. */
        beside={
          <Button
            type="button"
            variant="ghost"
            size="sm-icon"
            aria-pressed={isHelpShown}
            aria-label={isHelpShown ? t('centers.page.hideHowItWorks') : t('centers.help.title')}
            title={isHelpShown ? t('centers.page.hideHowItWorks') : t('centers.help.title')}
            onClick={() => setIsHelpShown((wasShown) => !wasShown)}
          >
            <CircleHelp className="size-5" aria-hidden="true" />
          </Button>
        }
        actions={
          // `size="sm"` like the main action of the summary, and the icon without
          // a size of its own: the size of the icons is set by the button.
          <Button type="button" size="sm" onClick={() => setIsCreating(true)} className="shrink-0">
            <Plus aria-hidden="true" />
            {t('centers.page.newCostCenter')}
          </Button>
        }
      />

      {isHelpShown && <CostCentersHelp onClose={() => setIsHelpShown(false)} />}

      <CostCenterList categories={categories} onCreate={() => setIsCreating(true)} />

      <CategoryModal level="costCenter" isOpen={isCreating} onClose={() => setIsCreating(false)} />
    </div>
  );
}

/** The tree, or what stands in for it: loading, failed, or truly empty. */
function CostCenterList({
  categories,
  onCreate,
}: {
  categories: ReturnType<typeof useCategories>;
  onCreate: () => void;
}) {
  const tree = categories.data ?? [];

  return (
    <>
      {categories.isPending && (
        <div className="flex flex-col gap-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-28 rounded-lg" />
          ))}
        </div>
      )}

      {/* A failed load is NOT an empty tree: inviting to create here would
          duplicate centers that already exist. */}
      {categories.isError && <ErrorAlert message={t('centers.page.loadFailed')} />}

      {categories.isSuccess && tree.length === 0 && <NoCostCenters onCreate={onCreate} />}

      {tree.map((costCenter) => (
        <CostCenterCard key={costCenter.id} costCenter={costCenter} tree={tree} />
      ))}
    </>
  );
}

function NoCostCenters({ onCreate }: { onCreate: () => void }) {
  return (
    <Card>
      <CardContent className="p-10 text-center">
        <p className="text-sm text-muted-foreground">{t('centers.page.empty')}</p>
        {/* The button here as well as above: on an empty screen, the
            only thing that can be done has to be where one is
            looking. */}
        <Button type="button" onClick={onCreate} className="mt-4">
          <Plus className="size-4" aria-hidden="true" />
          {t('centers.page.createCostCenter')}
        </Button>
      </CardContent>
    </Card>
  );
}
