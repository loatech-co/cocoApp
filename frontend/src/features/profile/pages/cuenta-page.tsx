import { LogOut, ShieldCheck } from 'lucide-react';
import { useEffect, useState, type SubmitEvent } from 'react';
import { useLocation } from 'react-router-dom';

import { Ajustes } from '@/features/profile/components/ajustes';
import { detallesDeError, mensajeDeErrorDeAuth, useAuth } from '@/shared/api/auth-context';
import { t } from '@/shared/lib/i18n';
import { useEnLaApp } from '@/shared/lib/movil';
import { SECCIONES_DE_ADMIN } from '@/shared/lib/sections';
import { Alert, AlertDescription, AlertTitle, ErrorAlert } from '@/shared/ui/atoms/alert';
import { Badge } from '@/shared/ui/atoms/badge';
import { Button } from '@/shared/ui/atoms/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/shared/ui/atoms/card';
import { Field } from '@/shared/ui/atoms/field';
import { Input } from '@/shared/ui/atoms/input';
import { PageHeader } from '@/shared/ui/atoms/page-header';
import { PasswordPolicy, meetsPolicy } from '@/shared/ui/atoms/password-policy';
import { LinkRow } from '@/shared/ui/molecules/link-row';

/**
 * Mi cuenta: cambiar contraseña y cerrar sesión en todas partes.
 *
 * Las dos acciones que tiene que poder hacer alguien que sospecha que su cuenta
 * está comprometida, sin depender de nadie.
 */
export function CuentaPage() {
  const { usuario, esAdmin } = useAuth();
  /*
    Dentro de la app del teléfono esta página es la pestaña «Más», y hace lo
    que fuera hace la hoja del avatar —que allí no se monta—: llevar a la
    administración y cerrar sesión en ESTE dispositivo. Fuera de la app nada
    de eso aparece, porque ya está en la hoja o en el menú del riel.
  */
  const embebida = useEnLaApp();

  useScrollToHash();

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t('shell.account.myAccount')} description={usuario?.email} />

      {esAdmin && (
        <Badge variant="info" className="self-start">
          <ShieldCheck aria-hidden="true" />
          {t('admin.userRow.roleAdmin')}
        </Badge>
      )}

      {/* El margen de desplazamiento es el alto del techo del teléfono más un
          poco: sin él, la sección a la que se acaba de llegar queda justo
          DEBAJO de la franja de la marca, que está pegada arriba. */}
      <section id="ajustes" className="scroll-mt-20">
        <Ajustes />
      </section>

      {embebida && esAdmin && <AdminLinks />}

      {/* Las dos cosas que hace alguien que sospecha que su cuenta está
          comprometida, juntas y con un nombre: cambiar la contraseña y echar
          a todo el mundo. Separadas no había a dónde apuntar desde fuera. */}
      <section id="seguridad" className="flex scroll-mt-20 flex-col gap-6">
        <CambiarContrasena />

        <SessionCards embebida={embebida} />
      </section>
    </div>
  );
}

function CambiarContrasena() {
  const form = usePasswordChange();

  if (form.hecho) {
    return (
      <Alert variant="info">
        <AlertTitle>{t('profile.account.passwordChangedTitle')}</AlertTitle>
        <AlertDescription>{t('profile.account.passwordChangedHelp')}</AlertDescription>
      </Alert>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('profile.account.changePassword')}</CardTitle>
        <CardDescription>{t('profile.account.changePasswordHelp')}</CardDescription>
      </CardHeader>

      <CardContent>
        {form.error && <PasswordErrors error={form.error} problemas={form.problemas} />}

        <PasswordForm form={form} />
      </CardContent>
    </Card>
  );
}

function PasswordForm({ form }: { form: ReturnType<typeof usePasswordChange> }) {
  const { actual, setActual, nueva, setNueva, enviando, onSubmit } = form;
  return (
    <form onSubmit={onSubmit} className="flex max-w-sm flex-col gap-4">
      <Field label={t('profile.account.currentPassword')} id="actual">
        <Input
          id="actual"
          type="password"
          autoComplete="current-password"
          required
          value={actual}
          onChange={(evento) => setActual(evento.target.value)}
        />
      </Field>

      <div className="flex flex-col gap-2">
        <Field label={t('admin.userRow.newPassword')} id="nueva">
          <Input
            id="nueva"
            type="password"
            autoComplete="new-password"
            required
            value={nueva}
            onChange={(evento) => setNueva(evento.target.value)}
            aria-describedby="requisitos-nueva"
          />
        </Field>
        <div id="requisitos-nueva">
          <PasswordPolicy password={nueva} />
        </div>
      </div>

      <Button type="submit" disabled={enviando || !meetsPolicy(nueva) || !actual}>
        {t('profile.account.changePassword')}
      </Button>
    </form>
  );
}

function PasswordErrors({ error, problemas }: { error: string; problemas: string[] }) {
  return (
    <div className="mb-4">
      <ErrorAlert message={error} details={problemas} />
    </div>
  );
}

/** Las dos contraseñas, sus errores y el envío del cambio. */
function usePasswordChange() {
  const { cambiarContrasena } = useAuth();

  const [actual, setActual] = useState('');
  const [nueva, setNueva] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [problemas, setProblemas] = useState<string[]>([]);
  const [enviando, setEnviando] = useState(false);
  const [hecho, setHecho] = useState(false);

  function onSubmit(evento: SubmitEvent<HTMLFormElement>): void {
    evento.preventDefault();
    setError(null);
    setProblemas([]);
    setEnviando(true);

    void cambiarContrasena(actual, nueva)
      .then(() => setHecho(true))
      .catch((causa: unknown) => {
        setError(mensajeDeErrorDeAuth(causa));
        setProblemas(detallesDeError(causa));
      })
      .finally(() => setEnviando(false));
  }

  return { actual, setActual, nueva, setNueva, error, problemas, enviando, hecho, onSubmit };
}

/** Cerrar sesión: aquí, dentro de la app, y en todos los dispositivos. */
function SessionCards({ embebida }: { embebida: boolean }) {
  const { salir, salirDeTodosLosDispositivos } = useAuth();
  return (
    <>
      {embebida && (
        <Card>
          <CardHeader>
            <CardTitle>{t('shell.account.signOut')}</CardTitle>
            <CardDescription>{t('profile.account.signOutHelp')}</CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="outline" size="sm" onClick={() => void salir()}>
              <LogOut aria-hidden="true" />
              {t('shell.account.signOut')}
            </Button>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>{t('profile.account.signOutAllTitle')}</CardTitle>
          <CardDescription>{t('profile.account.signOutAllHelp')}</CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="outline" onClick={() => void salirDeTodosLosDispositivos()}>
            <LogOut aria-hidden="true" />
            {t('profile.account.signOutAll')}
          </Button>
        </CardContent>
      </Card>
    </>
  );
}

function AdminLinks() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('shell.rail.admin')}</CardTitle>
      </CardHeader>
      <CardContent>
        {/* Las mismas secciones, en el mismo orden, que el riel y la hoja
            del avatar: una segunda lista se separaría de esta la primera
            vez que se añada una pantalla. */}
        <nav aria-label={t('shell.rail.admin')} className="-mx-3 flex flex-col">
          {SECCIONES_DE_ADMIN.map((seccion) => (
            <LinkRow key={seccion.to} Icon={seccion.Icono} to={seccion.to}>
              {seccion.label}
            </LinkRow>
          ))}
        </nav>
      </CardContent>
    </Card>
  );
}

function useScrollToHash(): void {
  const { hash } = useLocation();
  /*
    ── Las anclas ────────────────────────────────────────────────────────────
    La hoja de la cuenta del teléfono ofrece «Ajustes» y «Seguridad» como dos
    entradas distintas, y las dos llevan aquí: son dos TROZOS de esta página,
    no dos pantallas. Partirla en tres dejaría tres pantallas de una tarjeta.

    Y hace falta llevar la vista al sitio a mano porque el enrutador no lo
    hace: cambia la ruta sin tocar el desplazamiento, así que «Seguridad»
    dejaba a la persona arriba del todo mirando los ajustes.
  */
  useEffect(() => {
    if (!hash) return;
    document.getElementById(hash.slice(1))?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [hash]);
}
