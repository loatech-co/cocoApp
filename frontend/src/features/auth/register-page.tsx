import { Logo } from '@/components/logo';
import { Loader2, UserPlus } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Link, Navigate } from 'react-router-dom';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { detallesDeError, mensajeDeErrorDeAuth, useAuth } from '@/lib/auth-context';
import { PoliticaDeContrasena, cumpleLaPolitica } from './politica-de-contrasena';
import { Campo } from '@/components/ui/campo';

/**
 * Solicitar acceso.
 *
 * No es "crear cuenta y entrar": toda cuenta nace pendiente y necesita la
 * aprobación de un administrador. Se dice desde el principio, para que nadie
 * se registre esperando entrar de inmediato.
 */
export function RegisterPage() {
  const { usuario, cargando, registrarse } = useAuth();

  const [nombre, setNombre] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [problemas, setProblemas] = useState<string[]>([]);
  const [enviando, setEnviando] = useState(false);
  const [enviado, setEnviado] = useState<'pendiente' | 'lista' | null>(null);

  if (!cargando && usuario) {
    return <Navigate to="/" replace />;
  }

  function onSubmit(evento: FormEvent<HTMLFormElement>): void {
    evento.preventDefault();
    setError(null);
    setProblemas([]);
    setEnviando(true);

    void registrarse(email, password, nombre)
      .then((respuesta) => setEnviado(respuesta.pending_approval ? 'pendiente' : 'lista'))
      .catch((causa: unknown) => {
        setError(mensajeDeErrorDeAuth(causa));
        // La API dice exactamente qué le falta a la contraseña; ocultarlo
        // obligaría a adivinar y empujaría a elegir lo más flojo que pase.
        setProblemas(detallesDeError(causa));
      })
      .finally(() => setEnviando(false));
  }

  if (enviado) {
    return <SolicitudRecibida estado={enviado} />;
  }

  const politicaOk = cumpleLaPolitica(password);

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
        <h1 className="sr-only">Coco — solicitar acceso</h1>

        <Logo className="mx-auto mb-8 h-11 w-auto text-sidebar-active" />

        <Card>
          <CardHeader>
            <CardTitle>Solicitar acceso</CardTitle>
            <CardDescription>
              Un administrador debe aprobar tu cuenta antes de que puedas entrar.
            </CardDescription>
          </CardHeader>

          <CardContent className="flex flex-col gap-4">
            {error && (
              <Alert variant="destructive">
                <AlertDescription>
                  {error}
                  {problemas.length > 0 && (
                    <ul className="mt-2 list-disc space-y-0.5 pl-4">
                      {problemas.map((problema) => (
                        <li key={problema}>{problema}</li>
                      ))}
                    </ul>
                  )}
                </AlertDescription>
              </Alert>
            )}

            <form onSubmit={onSubmit} className="flex flex-col gap-4">
              <Campo etiqueta="Nombre" id="nombre">
                <Input
                  id="nombre"
                  autoComplete="name"
                  required
                  minLength={2}
                  value={nombre}
                  onChange={(evento) => setNombre(evento.target.value)}
                />
              </Campo>

              <Campo etiqueta="Correo" id="email">
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(evento) => setEmail(evento.target.value)}
                />
              </Campo>

              <div className="flex flex-col gap-2">
                <Campo etiqueta="Contraseña" id="password">
                  <Input
                    id="password"
                    type="password"
                    autoComplete="new-password"
                    required
                    value={password}
                    onChange={(evento) => setPassword(evento.target.value)}
                    aria-describedby="requisitos-password"
                  />
                </Campo>
                <div id="requisitos-password">
                  <PoliticaDeContrasena password={password} />
                  <p className="mt-2 text-xs text-muted-foreground">
                    No puede contener tu nombre ni tu correo, ni aparecer en filtraciones
                    públicas conocidas.
                  </p>
                </div>
              </div>

              <Button type="submit" className="w-full" disabled={enviando || !politicaOk}>
                {enviando ? (
                  <Loader2 className="animate-spin" aria-hidden="true" />
                ) : (
                  <UserPlus aria-hidden="true" />
                )}
                {enviando ? 'Un momento…' : 'Solicitar acceso'}
              </Button>
            </form>

            <p className="text-center text-sm text-muted-foreground">
              ¿Ya tienes cuenta?{' '}
              <Link to="/entrar" className="text-primary underline-offset-4 hover:underline">
                Iniciar sesión
              </Link>
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
        <h1 className="sr-only">Coco — solicitud enviada</h1>

        <Logo className="mx-auto mb-8 h-11 w-auto text-sidebar-active" />

        <Alert variant="info" className="text-left">
          <AlertTitle>{lista ? 'Tu cuenta está lista' : 'Recibimos tu solicitud'}</AlertTitle>
          <AlertDescription>
            {lista
              ? 'Eres el administrador de esta instalación. Ya puedes entrar con el correo y la contraseña que acabas de elegir.'
              : 'Un administrador debe aprobarla antes de que puedas entrar. Cuando esté lista, podrás acceder con el correo y la contraseña que acabas de elegir.'}
          </AlertDescription>
        </Alert>

        <Link
          to="/entrar"
          className="mt-6 inline-block text-sm text-primary underline-offset-4 hover:underline"
        >
          {lista ? 'Iniciar sesión' : 'Volver a iniciar sesión'}
        </Link>
      </div>
    </main>
  );
}
