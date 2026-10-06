import { X } from 'lucide-react';

import { t } from '@/shared/lib/i18n';
import { Button } from '@/shared/ui/atoms/button';
import { Card, CardContent } from '@/shared/ui/atoms/card';

/** El modelo explicado con el ejemplo más común, no en abstracto. */
export function Explicacion({ onCerrar }: { onCerrar: () => void }) {
  return (
    <Card>
      <CardContent className="p-4 sm:p-6">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="font-display text-xl font-semibold">{t('centers.help.title')}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{t('centers.help.intro')}</p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm-icon"
            onClick={onCerrar}
            aria-label={t('common.close')}
            title={t('common.close')}
          >
            <X className="size-4" aria-hidden="true" />
          </Button>
        </div>

        <ol className="mt-4 flex flex-col gap-3">
          <Nivel
            numero={1}
            nombre={t('centers.levels.costCenter')}
            explicacion={t('centers.help.costCenterExplain')}
            ejemplo={t('centers.help.costCenterExample')}
          />
          <Nivel
            numero={2}
            nombre={t('centers.levels.category')}
            explicacion={t('centers.help.categoryExplain')}
            ejemplo={t('centers.help.categoryExample')}
          />
          <Nivel
            numero={3}
            nombre={t('centers.levels.concept')}
            explicacion={t('centers.help.conceptExplain')}
            ejemplo={t('centers.help.conceptExample')}
          />
        </ol>

        <p className="mt-4 rounded-lg bg-muted p-3 text-sm text-muted-foreground">
          {t('centers.help.sumBefore')}
          <strong className="text-foreground">{t('centers.help.sumQuestion')}</strong>
          {t('centers.help.sumAfter')}
        </p>
      </CardContent>
    </Card>
  );
}

function Nivel({
  numero,
  nombre,
  explicacion,
  ejemplo,
}: {
  numero: number;
  nombre: string;
  explicacion: string;
  ejemplo: string;
}) {
  return (
    <li className="flex gap-3" style={{ paddingLeft: `${(numero - 1) * 1.25}rem` }}>
      <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
        {numero}
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-semibold">{nombre}</span>
        <span className="block text-sm text-muted-foreground">
          {t('centers.help.example', { text: explicacion })}
          <em className="text-foreground">{ejemplo}</em>
        </span>
      </span>
    </li>
  );
}
