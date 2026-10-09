import { LayoutDashboard, ScrollText, ShieldCheck, Tags, UserCog, Wallet } from 'lucide-react';
import { type ComponentType } from 'react';

import { t } from '@/shared/lib/i18n';

/*
  The app's sections: the list of what exists and where it leads.

  They live in `shared` and not in the shell because My account (a feature)
  offers the administration ones on the phone, and a feature does not import
  from `app/`. What decides which ones each person SEES —`useSecciones`— does
  belong to the shell.
*/

export interface Section {
  to: string;
  label: string;
  Icon: ComponentType<{
    className?: string;
    'aria-hidden'?: boolean;
    fill?: string;
    fillOpacity?: number;
    strokeWidth?: number;
  }>;
  exact: boolean;
  /** Preference that must be on for the section to exist. */
  requires?: 'cuentas';
}

/**
 * Sections that are built. The rest (Budgets, Fixed, Debts, Reports) are
 * added in their phase: showing dead links is worse than not showing them.
 *
 * `requires` marks the ones that depend on a preference. It is declared here,
 * in the list itself, so that the ORDER of the menu is the order of this array
 * and nothing else — inserting a conditional section by position breaks
 * silently as soon as someone reorders.
 */
/**
 * The home, with a name of its own.
 *
 * The phone's bottom bar names it separately —it is its first slot, and the
 * other four are not sections but things you do—, so the section has to be
 * citable without going through an array index, which breaks silently as soon
 * as someone reorders the list.
 */
export const DASHBOARD: Section = {
  to: '/',
  label: t('shell.sections.dashboard'),
  Icon: LayoutDashboard,
  exact: true,
};

export const SECTIONS: readonly Section[] = [
  DASHBOARD,
  // For someone who does not keep accounts, this link does not exist. Neither
  // hidden with CSS nor disabled: absent.
  {
    to: '/accounts',
    label: t('shell.sections.accounts'),
    Icon: Wallet,
    exact: false,
    requires: 'cuentas',
  },
  /*
    ── Cost centers belong to EVERYONE, not to administration ──────────────
    They sat under «Administración», with this argument: they are set up once
    and hardly touched, so they are not an everyday section.

    The argument fell when cost centers became per account. Before, they
    looked like shared structure —something someone leaves in place for the
    others—; now each account has its own, it is born with a template and the
    first thing it will want to do is adjust it: rename what does not serve
    it, add its concepts. Hiding it from non-admins left that person with no
    way to reach their own tree from the rail.

    And it was never really protected: `/cost-centers` does not go
    through `RequireAdmin`, so anyone could open it by typing the address.
    All the menu did was not say it existed.

    It goes last of the three because it is still the least visited: people
    come in to look at the summary, not to sort the taxonomy.
  */
  { to: '/cost-centers', label: t('shell.sections.costCenters'), Icon: Tags, exact: false },
];

/**
 * Administrators only.
 *
 * They are not shown hidden with CSS or "disabled": if you are not an admin,
 * these links do not exist in the DOM. Even so, the one that really decides
 * is the backend's RolesGuard — this is presentation, not access control.
 *
 * What remains are the two that administer OTHER people, which is what makes
 * an administrator one. What administers one's own things does not belong here.
 */
export const ADMIN_SECTIONS: readonly Section[] = [
  // 'Usuarios', not 'Cuentas': in this same bar 'Cuentas' already means cards
  // and savings. Two different things with the same name ten pixels apart.
  { to: '/admin', label: t('shell.sections.users'), Icon: ShieldCheck, exact: true },
  {
    to: '/admin/audit-log',
    label: t('shell.sections.auditLog'),
    Icon: ScrollText,
    exact: false,
  },
];

/** My account is not a section of the rail, but it is a page that exists. */
export const MY_ACCOUNT: Section = {
  to: '/account',
  label: t('shell.account.myAccount'),
  Icon: UserCog,
  exact: true,
};
