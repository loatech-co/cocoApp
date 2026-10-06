import { useRouteError } from 'react-router-dom';

import { t } from '@/shared/lib/i18n';
import { Button } from '@/shared/ui/atoms/button';
import { PAGE_TITLE } from '@/shared/ui/atoms/page-header';

/**
 * A screen's code that a deploy has replaced: the chunk with the old hash is
 * gone from the server. Browsers word it differently, and all three say the
 * same thing.
 */
const CODIGO_OBSOLETO =
  /dynamically imported module|Importing a module script failed|error loading dynamically imported module/i;

export function esCodigoObsoleto(error: unknown): boolean {
  return error instanceof Error && CODIGO_OBSOLETO.test(error.message);
}

/**
 * What the router draws when a screen breaks, in place of React Router's own
 * "Unexpected Application Error" page, which is in English, unstyled, and
 * also shows up inside the phone's web view.
 *
 * It is not a screen with content: like the 404, it uses `TITULO_DE_PAGINA`
 * and no page header (CLAUDE.md, rule 10). It never shows the error itself:
 * a stack trace says nothing to whoever is looking at it and may carry data.
 */
export function PantallaDeError() {
  const error = useRouteError();
  const obsoleto = esCodigoObsoleto(error);

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 px-4 text-center">
      <div className="flex flex-col gap-2">
        <h1 className={PAGE_TITLE}>
          {obsoleto ? t('shell.error.newVersionTitle') : t('shell.error.title')}
        </h1>
        <p className="text-sm text-muted-foreground">
          {obsoleto ? t('shell.error.newVersionHelp') : t('shell.error.help')}
        </p>
      </div>
      <div className="flex flex-wrap items-center justify-center gap-2">
        <Button onClick={() => window.location.reload()}>{t('shell.error.reload')}</Button>
        {!obsoleto && (
          <Button variant="outline" asChild>
            <a href="/">{t('common.goHome')}</a>
          </Button>
        )}
      </div>
    </main>
  );
}
