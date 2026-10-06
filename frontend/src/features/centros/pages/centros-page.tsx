import { CircleHelp, Plus } from 'lucide-react';
import { useState } from 'react';

import { CategoriaModal } from '@/features/centros/components/categoria-modal';
import { Explicacion } from '@/features/centros/components/centros-help';
import { Centro } from '@/features/centros/components/cost-center-card';
import { useCategories } from '@/shared/api/categories';
import { t } from '@/shared/lib/i18n';
import { ErrorAlert } from '@/shared/ui/atoms/alert';
import { Button } from '@/shared/ui/atoms/button';
import { CabeceraDePagina } from '@/shared/ui/atoms/cabecera-de-pagina';
import { Card, CardContent } from '@/shared/ui/atoms/card';
import { Skeleton } from '@/shared/ui/atoms/skeleton';

/**
 * Centros de costos.
 *
 * Es la pantalla donde se define la FORMA de los reportes, así que explica el
 * modelo en vez de dar por sentado que se entiende. Alguien que abre esto por
 * primera vez tiene que salir sabiendo qué es una categoría y por qué existe.
 */
export function CentrosPage() {
  const categorias = useCategories();

  const [creando, setCreando] = useState(false);
  const [verAyuda, setVerAyuda] = useState(false);

  return (
    <div className="flex flex-col gap-4 sm:gap-5">
      {/* El botón al extremo opuesto del título, como en el resto de la app:
          es la única acción de la pantalla y se busca siempre en la misma
          esquina. */}
      <CabeceraDePagina
        titulo={t('shell.sections.costCenters')}
        ayuda={t('centers.page.help')}
        /* La explicación se enseña una vez y estorba el resto de las veces.
           Detrás del signo de interrogación sigue estando para quien la
           necesite, sin ocupar media pantalla para quien ya la leyó. */
        junto={
          <Button
            type="button"
            variant="ghost"
            size="sm-icon"
            aria-pressed={verAyuda}
            aria-label={verAyuda ? t('centers.page.hideHowItWorks') : t('centers.help.title')}
            title={verAyuda ? t('centers.page.hideHowItWorks') : t('centers.help.title')}
            onClick={() => setVerAyuda((v) => !v)}
          >
            <CircleHelp className="size-5" aria-hidden="true" />
          </Button>
        }
        acciones={
          // `size="sm"` como la acción principal del resumen, y el icono sin
          // medida propia: el tamaño de los iconos lo pone el botón.
          <Button type="button" size="sm" onClick={() => setCreando(true)} className="shrink-0">
            <Plus aria-hidden="true" />
            {t('centers.page.newCostCenter')}
          </Button>
        }
      />

      {verAyuda && <Explicacion onCerrar={() => setVerAyuda(false)} />}

      <ListaDeCentros categorias={categorias} onCrear={() => setCreando(true)} />

      <CategoriaModal nivel="centro" abierta={creando} onCerrar={() => setCreando(false)} />
    </div>
  );
}

/** The tree, or what stands in for it: loading, failed, or truly empty. */
function ListaDeCentros({
  categorias,
  onCrear,
}: {
  categorias: ReturnType<typeof useCategories>;
  onCrear: () => void;
}) {
  const arbol = categorias.data ?? [];

  return (
    <>
      {categorias.isPending && (
        <div className="flex flex-col gap-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-28 rounded-lg" />
          ))}
        </div>
      )}

      {/* A failed load is NOT an empty tree: inviting to create here would
          duplicate centers that already exist. */}
      {categorias.isError && <ErrorAlert mensaje={t('centers.page.loadFailed')} />}

      {categorias.isSuccess && arbol.length === 0 && <SinCentros onCrear={onCrear} />}

      {arbol.map((centro) => (
        <Centro key={centro.id} centro={centro} arbol={arbol} />
      ))}
    </>
  );
}

function SinCentros({ onCrear }: { onCrear: () => void }) {
  return (
    <Card>
      <CardContent className="p-10 text-center">
        <p className="text-sm text-muted-foreground">{t('centers.page.empty')}</p>
        {/* El botón aquí además de arriba: en una pantalla vacía, lo
            único que se puede hacer tiene que estar donde se está
            mirando. */}
        <Button type="button" onClick={onCrear} className="mt-4">
          <Plus className="size-4" aria-hidden="true" />
          {t('centers.page.createCostCenter')}
        </Button>
      </CardContent>
    </Card>
  );
}
