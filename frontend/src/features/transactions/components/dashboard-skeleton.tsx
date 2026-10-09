import { TrendSkeleton } from '@/features/transactions/components/trend';
import { Card, CardContent } from '@/shared/ui/atoms/card';
import { Skeleton } from '@/shared/ui/atoms/skeleton';

/** The dashboard while its figures arrive, with the measurements of what is coming. */
export function DashboardSkeleton() {
  return (
    <>
      <div className="grid grid-cols-2 gap-3 sm:gap-5 xl:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-24 rounded-lg" />
        ))}
      </div>
      {/* The same bottom row, with the same measurements: a skeleton that
        shifts around when the data arrives is worse than none. */}
      <div className="grid gap-3 sm:gap-5 lg:auto-rows-[420px] lg:grid-cols-2 xl:grid-cols-4">
        <Card className="h-full min-h-0 lg:col-span-2">
          <CardContent className="flex h-full flex-col p-4 sm:p-6">
            <Skeleton className="mb-4 h-6 w-40" />
            <div className="min-h-0 flex-1">
              <TrendSkeleton />
            </div>
          </CardContent>
        </Card>
        <Skeleton className="h-72 w-full rounded-lg lg:h-full" />
        <Skeleton className="h-72 w-full rounded-lg lg:h-full" />
      </div>
    </>
  );
}
