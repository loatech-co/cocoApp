import { Check, X } from 'lucide-react';

import { t } from '@/shared/lib/i18n';
import { cn } from '@/shared/lib/utils';

/**
 * Requisitos de contraseña, comprobados en vivo.
 *
 * ESPEJO de `api/src/modules/auth/password.policy.ts`, no la fuente de verdad:
 * el servidor valida siempre, y si alguien desactivara este componente no
 * ganaría nada. Su trabajo es que nadie descubra los requisitos a base de
 * errores — eso es lo que empuja a la gente a elegir la contraseña más floja
 * que pase.
 *
 * Si la política cambia en el backend, este archivo cambia en el MISMO commit.
 */

const LONGITUD_MINIMA = 12;

interface Requisito {
  etiqueta: string;
  cumple: (password: string) => boolean;
}

const REQUISITOS: Requisito[] = [
  {
    etiqueta: t('ui.passwordPolicy.minLength', { min: LONGITUD_MINIMA }),
    cumple: (p) => p.length >= LONGITUD_MINIMA,
  },
  { etiqueta: t('ui.passwordPolicy.smallLetter'), cumple: (p) => /[a-z]/.test(p) },
  { etiqueta: t('ui.passwordPolicy.capitalLetter'), cumple: (p) => /[A-Z]/.test(p) },
  { etiqueta: t('ui.passwordPolicy.number'), cumple: (p) => /[0-9]/.test(p) },
  { etiqueta: t('ui.passwordPolicy.symbol'), cumple: (p) => /[^A-Za-z0-9]/.test(p) },
];

export function cumpleLaPolitica(password: string): boolean {
  return REQUISITOS.every((requisito) => requisito.cumple(password));
}

export function PoliticaDeContrasena({ password }: { password: string }) {
  return (
    <ul className="mt-2 space-y-1" aria-label={t('ui.passwordPolicy.label')}>
      {REQUISITOS.map((requisito) => {
        const cumple = requisito.cumple(password);
        // El icono acompaña al color, nunca lo sustituye: el estado tiene que
        // leerse igual sin distinguir colores.
        const Icono = cumple ? Check : X;

        return (
          <li
            key={requisito.etiqueta}
            className={cn(
              'flex items-center gap-2 text-xs transition-colors',
              cumple ? 'text-income' : 'text-muted-foreground',
            )}
          >
            <Icono className="size-3.5 shrink-0" aria-hidden="true" />
            <span>{requisito.etiqueta}</span>
            <span className="sr-only">{cumple ? '(cumplido)' : '(pendiente)'}</span>
          </li>
        );
      })}
    </ul>
  );
}
