import { Logo } from '@/components/logo';
import { AlertCircle, Loader2, LogIn } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Link, Navigate, useLocation } from 'react-router-dom';

import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { mensajeDeErrorDeAuth, useAuth } from '@/lib/auth-context';

/**
 * Entrar.
 *
 * Sin "¿la olvidaste?": todavía no se envían correos, así que un enlace de
 * recuperación sería una promesa que la app no puede cumplir. Quien olvide su
 * contraseña la recupera pidiéndosela al administrador, que puede restablecerla
 * desde el panel. Cuando exista el envío de correo, aquí va el enlace.
 */
export function LoginPage() {
  const { usuario, cargando, entrar } = useAuth();
  const location = useLocation() as { state?: { from?: string } };

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  if (!cargando && usuario) {
    return <Navigate to={location.state?.from ?? '/'} replace />;
  }

  function onSubmit(evento: FormEvent<HTMLFormElement>): void {
    evento.preventDefault();
    setError(null);
    setEnviando(true);

    void entrar(email, password)
      .catch((causa: unknown) => setError(mensajeDeErrorDeAuth(causa)))
      .finally(() => setEnviando(false));
  }

  return (
    <main className="min-h-dvh lg:grid lg:grid-cols-2">
      {/* El formulario va PRIMERO en el DOM además de a la izquierda: es lo
          que la persona viene a hacer, y quien navega con teclado o lector de
          pantalla lo encuentra sin atravesar antes la decoración. */}
      <section className="flex min-h-dvh items-center justify-center bg-background px-5 py-10 lg:min-h-0">
        <div className="w-full max-w-sm">
        {/* `mx-auto`, no `text-center`: el logotipo es un SVG de BLOQUE con
            ancho automático, y centrar texto no lo mueve. */}
        <Logo className="mx-auto mb-8 h-9 w-auto text-bosque-800" />

        <Card>
          <CardHeader>
            <CardTitle>Entrar</CardTitle>
            <CardDescription>Accede con tu correo y contraseña.</CardDescription>
          </CardHeader>

          <CardContent className="flex flex-col gap-4">
            {error && (
              <Alert variant="destructive">
                <AlertCircle aria-hidden="true" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <form onSubmit={onSubmit} className="flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <Label htmlFor="email">Correo</Label>
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(evento) => setEmail(evento.target.value)}
                  aria-invalid={error !== null}
                />
              </div>

              <div className="flex flex-col gap-2">
                <Label htmlFor="password">Contraseña</Label>
                <Input
                  id="password"
                  type="password"
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(evento) => setPassword(evento.target.value)}
                  aria-invalid={error !== null}
                />
              </div>

              <Button type="submit" className="w-full" disabled={enviando}>
                {enviando ? (
                  <Loader2 className="animate-spin" aria-hidden="true" />
                ) : (
                  <LogIn aria-hidden="true" />
                )}
                {enviando ? 'Un momento…' : 'Entrar'}
              </Button>
            </form>

            <p className="text-center text-sm text-muted-foreground">
              ¿No tienes cuenta?{' '}
              <Link to="/registro" className="text-primary underline-offset-4 hover:underline">
                Solicitar acceso
              </Link>
            </p>
          </CardContent>
        </Card>

        <p className="mt-6 text-center text-xs text-muted-foreground">
          ¿Olvidaste tu contraseña? Pídele al administrador que la restablezca.
        </p>
        </div>
      </section>

      {/*
        La mitad de marca. En móvil DESAPARECE, no se apila: un teléfono no
        tiene alto que gastar en decoración antes del formulario, y empujar el
        campo de correo bajo el pliegue es la forma más rápida de que alguien
        abandone.

        El padding va en el CONTENEDOR y el redondeo en la imagen: así la
        imagen respira contra el borde de la pantalla en vez de sangrar, que es
        lo que pediste.
      */}
      <section className="hidden bg-background p-6 lg:block">
        {/*
          El padding va en el CONTENEDOR y el redondeo en la imagen: así respira
          contra el borde de la pantalla en vez de sangrar.

          12px exactos, no `rounded-xl`: este proyecto sobrescribe los tokens de
          radio y `rounded-xl` aquí son 20px.

          Por CSS y no con <img>: si la imagen no carga —red lenta, navegador
          sin WebP— queda el verde de fondo y la pantalla sigue siendo usable.
          Un <img> roto dejaría el icono de imagen partida.

          WebP sin respaldo JPG a propósito: lo soportan todos los navegadores
          desde 2020. El original vive en frontend/assets-fuente/, con cómo
          regenerarlo.
        */}
        <div
          className="size-full overflow-hidden rounded-[12px] bg-bosque-800 bg-cover bg-center"
          style={{ backgroundImage: 'url(/fondo-login.webp)' }}
          role="presentation"
        />
      </section>
    </main>
  );
}
