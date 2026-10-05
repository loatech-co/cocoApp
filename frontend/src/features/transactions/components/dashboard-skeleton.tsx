import { TendenciaEsqueleto } from '@/features/transactions/components/tendencia';
import { Card, CardContent } from '@/shared/ui/atoms/card';
import { Skeleton } from '@/shared/ui/atoms/skeleton';

/** El resumen mientras llegan sus cifras, con las medidas de lo que viene. */
export function DashboardSkeleton() {
  return (
    <>
      <div className="grid grid-cols-2 gap-3 sm:gap-5 xl:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-24 rounded-lg" />
        ))}
      </div>
      {/* La misma fila de abajo, con las mismas medidas: un esqueleto que
        se recoloca al llegar los datos es peor que no ponerlo. */}
      <div className="grid gap-3 sm:gap-5 lg:auto-rows-[420px] lg:grid-cols-2 xl:grid-cols-4">
        <Card className="h-full min-h-0 lg:col-span-2">
          <CardContent className="flex h-full flex-col p-4 sm:p-6">
            <Skeleton className="mb-4 h-6 w-40" />
            <div className="min-h-0 flex-1">
              <TendenciaEsqueleto />
            </div>
          </CardContent>
        </Card>
        <Skeleton className="h-72 w-full rounded-lg lg:h-full" />
        <Skeleton className="h-72 w-full rounded-lg lg:h-full" />
      </div>
    </>
  );
}
