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
 * La hoja del avatar.
 *
 * ── Qué contesta ────────────────────────────────────────────────────────────
 * Lo mismo que el menú de la cuenta del riel en el escritorio: «¿con qué
 * cuenta estoy dentro?» y «¿por dónde salgo?». Lo de en medio son las páginas
 * que se configuran una vez y casi no se tocan — las que no merecen un hueco
 * fijo en una barra de cinco.
 *
 * ── Por qué sube desde abajo y no baja desde el avatar ──────────────────────
 * Porque el avatar vive en la esquina de abajo a la derecha. Un desplegable
 * colgado de ahí crece hacia el borde y hacia el pie: se recorta contra los
 * dos. Una hoja llega por el mismo borde por el que se tocó, que es el único
 * movimiento que el ojo puede seguir de vuelta.
 *
 * ── El perfil no es una fila más ────────────────────────────────────────────
 * Va en la cabeza, con su avatar, su nombre y su correo. Es lo que la hoja
 * CONTESTA nada más abrirse —con qué cuenta se está dentro—, y puesto como
 * sexta fila haría falta leerlo para encontrarlo. El correo va debajo del
 * nombre porque dos personas pueden llamarse igual y no tener el mismo correo.
 *
 * ── Lo que no está para todo el mundo, no está ──────────────────────────────
 * Usuarios y Bitácora son de administración: quien no lo es no las tiene ni
 * apagadas ni escondidas con CSS. Ausentes, como en el riel.
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
          Ajustes y Seguridad son dos TROZOS de Mi cuenta, no dos pantallas.
          Por eso van por ancla y no por ruta: partir esa página en tres dejaría
          tres pantallas de una tarjeta cada una, y la de en medio sin nada que
          justificara el viaje. El ancla lleva al sitio exacto y la página sigue
          siendo una.
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

        {/* La raya, y no un hueco: lo de abajo no lleva a ninguna página. */}
        <hr className="my-2 border-border" />

        {/*
          Ver la aplicación como la ve quien no administra nada.

          Se enseña con el rol DE VERDAD y no con el efectivo: encendida la
          vista, `esAdmin` es falso —para eso está— y con esa condición el
          interruptor desaparecería justo cuando hace falta para apagarlo.
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
 * La cabeza: con qué cuenta se está dentro.
 *
 * Es un enlace a Mi cuenta —lo que uno espera al tocar su propia cara— y no un
 * rótulo: la página entera está detrás, y las dos filas de abajo solo llevan a
 * trozos suyos.
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

/** El interruptor de la vista de usuario, en forma de fila. */
function ViewAsUserRow({ onClose }: { onClose: () => void }) {
  const { isViewingAsUser, setViewAsUser } = useAuth();
  const navigate = useNavigate();
  return (
    <PanelRow
      onClick={() => {
        onClose();
        setViewAsUser(!isViewingAsUser);
        // Encendiéndola desde una pantalla de administración, quedarse
        // sería quedarse mirando un «no tienes acceso».
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
