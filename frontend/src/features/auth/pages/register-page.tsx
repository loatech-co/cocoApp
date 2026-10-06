import { Loader2, UserPlus } from 'lucide-react';
import { useState, type SubmitEvent } from 'react';
import { Link, Navigate } from 'react-router-dom';

import { detallesDeError, mensajeDeErrorDeAuth, useAuth } from '@/shared/api/auth-context';
import { t } from '@/shared/lib/i18n';
import { Alert, AlertDescription, AlertTitle, ErrorAlert } from '@/shared/ui/atoms/alert';
import { Button } from '@/shared/ui/atoms/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/shared/ui/atoms/card';
import { Field } from '@/shared/ui/atoms/field';
import { Input } from '@/shared/ui/atoms/input';
import { Logo } from '@/shared/ui/atoms/logo';
import { PasswordPolicy, meetsPolicy } from '@/shared/ui/atoms/password-policy';
import { TextLink } from '@/shared/ui/atoms/text-link';

/**
 * Solicitar acceso.
 *
 * No es "crear cuenta y entrar": toda cuenta nace pendiente y necesita la
 * aprobación de un administrador. Se dice desde el principio, para que nadie
 * se registre esperando entrar de inmediato.
 */
export function RegisterPage() {
  const { usuario, cargando, registrarse } = useAuth();
  const form = useRegisterForm(registrarse);

  if (!cargando && usuario) {
    return <Navigate to="/" replace />;
  }

  if (form.enviado) {
    return <SolicitudRecibida estado={form.enviado} />;
  }

  return (
    <main className="flex min-h-dvh items-center justify-center bg-background px-4 py-10">
      <div className="w-full max-w-sm">
        {/* h-11 ≈ 168px de ancho, que es lo que medía la placa que tenía detrás
            (24px + logotipo + 24px). `mx-auto` y no `text-center`: es un SVG de
            BLOQUE con ancho automático, y centrar texto no lo movería. */}
        {/*
          El encabezado de nivel 1 de esta pantalla.

          No se pinta porque lo que se ve ya es el logotipo, pero tiene que
          EXISTIR: sin él, la única jerarquía de la página era el `<h2>` de la
          tarjeta, así que quien navega con lector de pantalla saltaba de
          encabezado en encabezado y aquí no encontraba ninguno del que
          colgaran los demás. El logotipo es un SVG y no puede hacer ese papel.
        */}
        <h1 className="sr-only">{t('auth.register.documentTitle')}</h1>

        <Logo className="mx-auto mb-8 h-11 w-auto text-sidebar-active" />

        <Card>
          <CardHeader>
            <CardTitle>{t('auth.requestAccess')}</CardTitle>
            <CardDescription>{t('auth.register.help')}</CardDescription>
          </CardHeader>

          <CardContent className="flex flex-col gap-4">
            <RegisterErrors error={form.error} problemas={form.problemas} />

            <RegisterForm form={form} />

            <p className="text-center text-sm text-muted-foreground">
              {t('auth.register.haveAccount')}
              <TextLink to="/">{t('auth.signIn')}</TextLink>
            </p>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}

/**
 * Confirmación deliberadamente vaga sobre si el correo ya existía.
 *
 * La API responde lo mismo en ambos casos —es lo que impide usar el registro
 * para averiguar quién tiene cuenta— y la interfaz respeta esa decisión. Para
 * alguien legítimo no cambia nada: en los dos casos espera aprobación.
 */
function SolicitudRecibida({ estado }: { estado: 'pendiente' | 'lista' }) {
  const lista = estado === 'lista';

  return (
    <main className="flex min-h-dvh items-center justify-center bg-background px-4 py-10">
      <div className="w-full max-w-sm text-center">
        {/* h-11 ≈ 168px de ancho, que es lo que medía la placa que tenía detrás
            (24px + logotipo + 24px). `mx-auto` y no `text-center`: es un SVG de
            BLOQUE con ancho automático, y centrar texto no lo movería. */}
        <h1 className="sr-only">{t('auth.register.sentDocumentTitle')}</h1>

        <Logo className="mx-auto mb-8 h-11 w-auto text-sidebar-active" />

        <Alert variant="info" className="text-left">
          <AlertTitle>
            {lista ? t('auth.register.readyTitle') : t('auth.register.receivedTitle')}
          </AlertTitle>
          <AlertDescription>
            {lista ? t('auth.register.readyHelp') : t('auth.register.receivedHelp')}
          </AlertDescription>
        </Alert>

        <Link
          to="/"
          className="mt-6 inline-block text-sm text-primary underline-offset-4 hover:underline"
        >
          {lista ? t('auth.signIn') : t('auth.register.backToSignIn')}
        </Link>
      </div>
    </main>
  );
}

function PasswordField({
  password,
  onCambiar,
}: {
  password: string;
  onCambiar: (password: string) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <Field label={t('auth.fields.password')} id="password">
        <Input
          id="password"
          type="password"
          autoComplete="new-password"
          required
          value={password}
          onChange={(evento) => onCambiar(evento.target.value)}
          aria-describedby="requisitos-password"
        />
      </Field>
      <div id="requisitos-password">
        <PasswordPolicy password={password} />
        <p className="mt-2 text-xs text-muted-foreground">{t('auth.register.passwordHelp')}</p>
      </div>
    </div>
  );
}

function RegisterForm({ form }: { form: ReturnType<typeof useRegisterForm> }) {
  const { nombre, setNombre, email, setEmail, password, setPassword, enviando, onSubmit } = form;
  const politicaOk = meetsPolicy(password);
  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <Field label={t('auth.fields.name')} id="nombre">
        <Input
          id="nombre"
          autoComplete="name"
          required
          minLength={2}
          value={nombre}
          onChange={(evento) => setNombre(evento.target.value)}
        />
      </Field>

      <Field label={t('auth.fields.email')} id="email">
        <Input
          id="email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(evento) => setEmail(evento.target.value)}
        />
      </Field>

      <PasswordField password={password} onCambiar={setPassword} />

      <Button type="submit" className="w-full" disabled={enviando || !politicaOk}>
        {enviando ? (
          <Loader2 className="animate-spin" aria-hidden="true" />
        ) : (
          <UserPlus aria-hidden="true" />
        )}
        {enviando ? t('auth.wait') : t('auth.requestAccess')}
      </Button>
    </form>
  );
}

function RegisterErrors({ error, problemas }: { error: string | null; problemas: string[] }) {
  if (!error) return null;
  return <ErrorAlert message={error} details={problemas} />;
}

/** Los campos de la solicitud, sus errores y el envío. */
function useRegisterForm(registrarse: ReturnType<typeof useAuth>['registrarse']) {
  const [nombre, setNombre] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [problemas, setProblemas] = useState<string[]>([]);
  const [enviando, setEnviando] = useState(false);
  const [enviado, setEnviado] = useState<'pendiente' | 'lista' | null>(null);

  function onSubmit(evento: SubmitEvent<HTMLFormElement>): void {
    evento.preventDefault();
    setError(null);
    setProblemas([]);
    setEnviando(true);

    void registrarse(email, password, nombre)
      .then((respuesta) => setEnviado(respuesta.pendingApproval ? 'pendiente' : 'lista'))
      .catch((causa: unknown) => {
        setError(mensajeDeErrorDeAuth(causa));
        // La API dice exactamente qué le falta a la contraseña; ocultarlo
        // obligaría a adivinar y empujaría a elegir lo más flojo que pase.
        setProblemas(detallesDeError(causa));
      })
      .finally(() => setEnviando(false));
  }

  return {
    nombre,
    setNombre,
    email,
    setEmail,
    password,
    setPassword,
    error,
    problemas,
    enviando,
    enviado,
    onSubmit,
  };
}
