import { AlertCircle, Loader2, Sparkles, Tags } from 'lucide-react';
import { useState } from 'react';

import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { ApiClientError } from '@/lib/api-client';
import { useCategories, useSembrarDiccionario, type CategoryTree } from '@/lib/queries';

const ETIQUETA_DE_KIND = {
  expense: 'Gastos',
  income: 'Ingresos',
  transfer: 'Transferencias',
} as const;

/** M2 — Categorías. Editables siempre; se archivan, nunca se borran. */
export function CategoriesPage() {
  const categorias = useCategories();
  const sembrar = useSembrarDiccionario();
  const [error, setError] = useState<string | null>(null);

  const vacio = categorias.isSuccess && categorias.data.length === 0;

  async function sembrarDiccionario(): Promise<void> {
    setError(null);
    try {
      await sembrar.mutateAsync();
    } catch (causa) {
      setError(
        causa instanceof ApiClientError ? causa.message : 'No se pudo sembrar el diccionario.',
      );
    }
  }

  const porTipo = agruparPorKind(categorias.data ?? []);

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="font-serif text-3xl font-semibold">Categorías</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Tu forma de ver el gasto. Puedes renombrarlas y reorganizarlas cuando quieras.
        </p>
      </header>

      {error && (
        <Alert variant="destructive">
          <AlertCircle aria-hidden="true" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {categorias.isPending && (
        <div className="flex flex-col gap-3">
          <Skeleton className="h-40" />
          <Skeleton className="h-40" />
        </div>
      )}

      {vacio && (
        <Card>
          <CardContent className="flex flex-col items-center gap-4 p-10 text-center">
            <Sparkles className="size-8 text-primary" aria-hidden="true" />
            <div>
              <h2 className="font-serif text-xl font-semibold">Empieza con un punto de partida</h2>
              <p className="mt-1 max-w-md text-sm text-muted-foreground">
                Podemos sembrar un diccionario pensado para Colombia —servicios, SOAT, EPS,
                mercado, domicilios— para que no arranques de cero. Es solo una sugerencia:
                renombra, archiva o amplía lo que quieras después.
              </p>
            </div>
            <Button onClick={() => void sembrarDiccionario()} disabled={sembrar.isPending}>
              {sembrar.isPending && <Loader2 className="animate-spin" aria-hidden="true" />}
              Sembrar diccionario sugerido
            </Button>
          </CardContent>
        </Card>
      )}

      {Object.entries(porTipo).map(([kind, raices]) =>
        raices.length === 0 ? null : (
          <Card key={kind}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Tags className="size-4 text-muted-foreground" aria-hidden="true" />
                {ETIQUETA_DE_KIND[kind as keyof typeof ETIQUETA_DE_KIND]}
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              {raices.map((raiz) => (
                <div key={raiz.id}>
                  <div className="flex items-center gap-2">
                    <span
                      className="size-3 shrink-0 rounded-full"
                      style={{ backgroundColor: raiz.color ?? 'var(--color-ash-400)' }}
                      aria-hidden="true"
                    />
                    <span className="font-medium">{raiz.name}</span>
                    {raiz.is_archived && <Badge variant="warning">Archivada</Badge>}
                  </div>

                  {raiz.children && raiz.children.length > 0 && (
                    <ul className="mt-2 flex flex-wrap gap-1.5 pl-5">
                      {raiz.children.map((hijo) => (
                        <li key={hijo.id}>
                          <Badge variant="outline">{hijo.name}</Badge>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}
            </CardContent>
          </Card>
        ),
      )}
    </div>
  );
}

function agruparPorKind(categorias: CategoryTree[]): Record<string, CategoryTree[]> {
  return {
    expense: categorias.filter((categoria) => categoria.kind === 'expense'),
    income: categorias.filter((categoria) => categoria.kind === 'income'),
    transfer: categorias.filter((categoria) => categoria.kind === 'transfer'),
  };
}
