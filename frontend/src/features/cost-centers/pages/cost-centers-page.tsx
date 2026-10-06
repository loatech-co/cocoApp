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
 * Centros de costos.
 *
 * Es la pantalla donde se define la FORMA de los reportes, así que explica el
 * modelo en vez de dar por sentado que se entiende. Alguien que abre esto por
 * primera vez tiene que salir sabiendo qué es una categoría y por qué existe.
 */
export function CostCentersPage() {
  const categories = useCategories();

  const [isCreating, setIsCreating] = useState(false);
  const [isHelpShown, setIsHelpShown] = useState(false);

  return (
    <div className="flex flex-col gap-4 sm:gap-5">
      {/* El botón al extremo opuesto del título, como en el resto de la app:
          es la única acción de la pantalla y se busca siempre en la misma
          esquina. */}
      <PageHeader
        title={t('shell.sections.costCenters')}
        description={t('centers.page.help')}
        /* La explicación se enseña una vez y estorba el resto de las veces.
           Detrás del signo de interrogación sigue estando para quien la
           necesite, sin ocupar media pantalla para quien ya la leyó. */
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
          // `size="sm"` como la acción principal del resumen, y el icono sin
          // medida propia: el tamaño de los iconos lo pone el botón.
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
        {/* El botón aquí además de arriba: en una pantalla vacía, lo
            único que se puede hacer tiene que estar donde se está
            mirando. */}
        <Button type="button" onClick={onCreate} className="mt-4">
          <Plus className="size-4" aria-hidden="true" />
          {t('centers.page.createCostCenter')}
        </Button>
      </CardContent>
    </Card>
  );
}
