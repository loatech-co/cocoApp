import { X } from 'lucide-react';

import { t } from '@/shared/lib/i18n';
import { Button } from '@/shared/ui/atoms/button';
import { Card, CardContent } from '@/shared/ui/atoms/card';

/** The model explained with the most common example, not in the abstract. */
export function CostCentersHelp({ onClose }: { onClose: () => void }) {
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
            onClick={onClose}
            aria-label={t('common.close')}
            title={t('common.close')}
          >
            <X className="size-4" aria-hidden="true" />
          </Button>
        </div>

        <ol className="mt-4 flex flex-col gap-3">
          <Level
            depth={1}
            name={t('centers.levels.costCenter')}
            explanation={t('centers.help.costCenterExplain')}
            example={t('centers.help.costCenterExample')}
          />
          <Level
            depth={2}
            name={t('centers.levels.category')}
            explanation={t('centers.help.categoryExplain')}
            example={t('centers.help.categoryExample')}
          />
          <Level
            depth={3}
            name={t('centers.levels.concept')}
            explanation={t('centers.help.conceptExplain')}
            example={t('centers.help.conceptExample')}
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

function Level({
  depth,
  name,
  explanation,
  example,
}: {
  depth: number;
  name: string;
  explanation: string;
  example: string;
}) {
  return (
    <li className="flex gap-3" style={{ paddingLeft: `${(depth - 1) * 1.25}rem` }}>
      <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
        {depth}
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-semibold">{name}</span>
        <span className="block text-sm text-muted-foreground">
          {t('centers.help.example', { text: explanation })}
          <em className="text-foreground">{example}</em>
        </span>
      </span>
    </li>
  );
}
