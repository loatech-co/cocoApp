import { Check, X } from 'lucide-react';

import { t } from '@/shared/lib/i18n';
import { cn } from '@/shared/lib/utils';

/**
 * Password requirements, checked live.
 *
 * MIRROR of `api/src/modules/auth/password.policy.ts`, not the source of truth:
 * the server always validates, and if someone disabled this component they would
 * gain nothing. Its job is that nobody discovers the requirements by way of
 * errors — that is what pushes people to pick the weakest password
 * that passes.
 *
 * If the policy changes in the backend, this file changes in the SAME commit.
 */

const MIN_LENGTH = 12;

interface Requirement {
  label: string;
  isMet: (password: string) => boolean;
}

const REQUIREMENTS: Requirement[] = [
  {
    label: t('ui.passwordPolicy.minLength', { min: MIN_LENGTH }),
    isMet: (p) => p.length >= MIN_LENGTH,
  },
  { label: t('ui.passwordPolicy.smallLetter'), isMet: (p) => /[a-z]/.test(p) },
  { label: t('ui.passwordPolicy.capitalLetter'), isMet: (p) => /[A-Z]/.test(p) },
  { label: t('ui.passwordPolicy.number'), isMet: (p) => /[0-9]/.test(p) },
  { label: t('ui.passwordPolicy.symbol'), isMet: (p) => /[^A-Za-z0-9]/.test(p) },
];

export function meetsPolicy(password: string): boolean {
  return REQUIREMENTS.every((requirement) => requirement.isMet(password));
}

export function PasswordPolicy({ password }: { password: string }) {
  return (
    <ul className="mt-2 space-y-1" aria-label={t('ui.passwordPolicy.label')}>
      {REQUIREMENTS.map((requirement) => {
        const isMet = requirement.isMet(password);
        // The icon goes with the color, never replaces it: the state has to
        // read the same without telling colors apart.
        const Icon = isMet ? Check : X;

        return (
          <li
            key={requirement.label}
            className={cn(
              'flex items-center gap-2 text-xs transition-colors',
              isMet ? 'text-income' : 'text-muted-foreground',
            )}
          >
            <Icon className="size-3.5 shrink-0" aria-hidden="true" />
            <span>{requirement.label}</span>
            <span className="sr-only">{isMet ? '(cumplido)' : '(pendiente)'}</span>
          </li>
        );
      })}
    </ul>
  );
}
