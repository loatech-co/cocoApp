import { Wallet } from 'lucide-react';

import { useUpdatePreferences, usePreferences } from '@/features/profile/api/preferences';
import { ApiClientError } from '@/shared/api/api-client';
import { t } from '@/shared/lib/i18n';
import { Alert, AlertDescription, ErrorAlert } from '@/shared/ui/atoms/alert';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/shared/ui/atoms/card';
import { Switch } from '@/shared/ui/atoms/switch';

/**
 * App settings.
 *
 * Today there is only one, and it is the one that changes the shape of half
 * the interface. It lives in My account and not in its own section: a
 * settings menu with a single switch is a menu not worth opening.
 */
export function Settings() {
  const preferences = usePreferences();
  const update = useUpdatePreferences();

  const error = update.error instanceof ApiClientError ? update.error.message : null;
  const isActive = preferences.data?.accountsEnabled ?? false;

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('shell.account.settings')}</CardTitle>
        <CardDescription>{t('profile.settings.help')}</CardDescription>
      </CardHeader>

      <CardContent className="flex flex-col gap-4">
        {/* Without the saved value, the switch would show «off» as if it were
            the person's choice. */}
        {preferences.isError && <ErrorAlert message={t('profile.settings.loadFailed')} />}

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <SettingRow
          icon={<Wallet className="size-5" aria-hidden="true" />}
          title={t('profile.settings.accountsTitle')}
          description={t('profile.settings.accountsHelp')}
          isActive={isActive}
          isLoading={preferences.isPending || update.isPending}
          onChange={(isEnabled) => update.mutate({ accountsEnabled: isEnabled })}
        />

        {isActive && (
          <p className="text-xs text-muted-foreground">{t('profile.settings.accountsOffNote')}</p>
        )}
      </CardContent>
    </Card>
  );
}

function SettingRow({
  icon,
  title,
  description,
  isActive,
  isLoading,
  onChange,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  isActive: boolean;
  isLoading: boolean;
  onChange: (isEnabled: boolean) => void;
}) {
  return (
    <div className="flex items-start gap-4">
      <span className="mt-0.5 text-muted-foreground">{icon}</span>

      <div className="min-w-0 flex-1">
        <p className="font-medium">{title}</p>
        <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>
      </div>

      <Switch
        checked={isActive}
        aria-label={title}
        isLoading={isLoading}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-1"
      />
    </div>
  );
}
