import { Eye, KeyRound, LogOut, ScrollText, ShieldCheck, SlidersHorizontal } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';

import { useAuth } from '@/shared/api/auth-context';
import { t } from '@/shared/lib/i18n';
import { cn } from '@/shared/lib/utils';
import { BottomSheet } from '@/shared/ui/atoms/bottom-sheet';
import { PANEL_ROW_CLASS, PanelRow } from '@/shared/ui/atoms/panel-row';
import { LinkRow } from '@/shared/ui/molecules/link-row';

import { Avatar } from './navigation';

/**
 * The avatar sheet.
 *
 * ── What it answers ─────────────────────────────────────────────────────────
 * The same as the rail's account menu on desktop: «which account am I signed
 * in with?» and «where do I sign out?». What sits in between are the pages
 * that are set up once and hardly touched — the ones that do not earn a fixed
 * slot in a five-slot bar.
 *
 * ── Why it rises from the bottom instead of dropping from the avatar ────────
 * Because the avatar lives in the bottom-right corner. A dropdown hanging from
 * there grows toward the edge and toward the foot: it gets clipped by both. A
 * sheet arrives through the same edge that was touched, which is the only
 * movement the eye can follow back.
 *
 * ── The profile is not one more row ─────────────────────────────────────────
 * It goes in the header, with its avatar, its name and its email. It is what
 * the sheet ANSWERS as soon as it opens —which account one is in—, and as a
 * sixth row it would have to be read to be found. The email goes under the
 * name because two people can share a name and not an email.
 *
 * ── What is not for everyone is not there ───────────────────────────────────
 * Users and Audit log are admin pages: whoever is not an admin does not get
 * them disabled or hidden with CSS. Absent, as in the rail.
 */
export function AccountPanel({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const { user, isAdmin, isRealAdmin, signOut } = useAuth();
  const name = user?.displayName ?? user?.email ?? '?';

  return (
    <BottomSheet
      isOpen={isOpen}
      title={t('shell.account.myAccount')}
      head={<ProfileSummary name={name} />}
      onClose={onClose}
    >
      <div className="flex flex-col">
        {/*
          Settings and Security are two PARTS of My account, not two screens.
          That is why they go by anchor and not by route: splitting that page
          in three would leave three one-card screens, the middle one with
          nothing to justify the trip. The anchor goes to the exact spot and
          the page stays one.
        */}
        <LinkRow Icon={SlidersHorizontal} to="/mi-cuenta#ajustes" onNavigate={onClose}>
          {t('shell.account.settings')}
        </LinkRow>

        {isAdmin && (
          <LinkRow Icon={ShieldCheck} to="/administracion" onNavigate={onClose}>
            {t('shell.sections.users')}
          </LinkRow>
        )}

        <LinkRow Icon={KeyRound} to="/mi-cuenta#seguridad" onNavigate={onClose}>
          {t('shell.account.security')}
        </LinkRow>

        {isAdmin && (
          <LinkRow Icon={ScrollText} to="/administracion/bitacora" onNavigate={onClose}>
            {t('shell.sections.auditLog')}
          </LinkRow>
        )}

        {/* The rule, not a gap: what is below does not lead to any page. */}
        <hr className="my-2 border-border" />

        {/*
          See the app as someone who administers nothing sees it.

          It shows with the REAL role and not the effective one: with the
          view on, `isAdmin` is false —that is the point— and with that
          condition the switch would vanish exactly when it is needed to
          turn it off.
        */}
        {isRealAdmin && <ViewAsUserRow onClose={onClose} />}

        <PanelRow tone="danger" onClick={() => void signOut()}>
          <LogOut className="size-4 shrink-0" aria-hidden="true" />
          <span className="min-w-0 flex-1 truncate">{t('shell.account.signOut')}</span>
        </PanelRow>
      </div>
    </BottomSheet>
  );
}

/**
 * The header: which account one is signed in with.
 *
 * It is a link to My account —what one expects when touching one's own face—
 * and not a label: the whole page is behind it, and the two rows below only
 * lead to parts of it.
 */
function ProfileSummary({ name }: { name: string }) {
  const { user } = useAuth();

  return (
    <Link
      to="/mi-cuenta"
      className={cn(PANEL_ROW_CLASS, '-mx-1.5 gap-3')}
      aria-label={t('shell.account.myAccountOf', { name })}
    >
      <Avatar name={name} className="size-10" />
      <span className="min-w-0 flex-1">
        <span className="block truncate font-display text-base font-semibold">
          {user?.displayName ?? '—'}
        </span>
        {user?.email && (
          <span className="block truncate text-xs text-muted-foreground">{user.email}</span>
        )}
      </span>
    </Link>
  );
}

/** The user-view switch, shaped as a row. */
function ViewAsUserRow({ onClose }: { onClose: () => void }) {
  const { isViewingAsUser, setViewAsUser } = useAuth();
  const navigate = useNavigate();
  return (
    <PanelRow
      onClick={() => {
        onClose();
        setViewAsUser(!isViewingAsUser);
        // Turned on from an admin screen, staying would mean staring at a
        // «you do not have access».
        if (!isViewingAsUser) void navigate('/');
      }}
    >
      {isViewingAsUser ? (
        <ShieldCheck className="size-4 shrink-0 opacity-70" aria-hidden="true" />
      ) : (
        <Eye className="size-4 shrink-0 opacity-70" aria-hidden="true" />
      )}
      <span className="min-w-0 flex-1 truncate">
        {isViewingAsUser ? t('common.backToAdmin') : t('shell.account.viewAsUser')}
      </span>
    </PanelRow>
  );
}
