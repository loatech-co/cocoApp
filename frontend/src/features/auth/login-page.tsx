import { AlertCircle, Loader2, LogIn } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Link, Navigate, useLocation } from 'react-router-dom';

import { FondoMarca } from '@/components/fondo-marca';
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
      {/*
        La mitad de marca. En móvil DESAPARECE, no se apila: un teléfono no
        tiene alto que gastar en decoración antes del formulario, y empujar el
        campo de correo bajo el pliegue es la forma más rápida de que alguien
        abandone. El carácter se mantiene con el color de fondo del formulario.
      */}
      <section className="relative hidden overflow-hidden bg-bosque-700 lg:block">
        <FondoMarca className="absolute inset-0 size-full" />

        {/* Velo: el texto tiene que leerse sobre las cápsulas lima, que son muy
            claras. Sin él, "Coco" caería sobre una franja y desaparecería. */}
        <div className="absolute inset-0 bg-gradient-to-t from-bosque-900/90 via-bosque-900/45 to-transparent" />

        <div className="relative flex h-full flex-col justify-end p-12 xl:p-16">
          <p className="text-4xl font-extrabold leading-tight tracking-tight text-white xl:text-5xl">
            Tus finanzas,
            <br />
            claras.
          </p>
          <p className="mt-4 max-w-md text-base leading-relaxed text-white/75">
            Cada peso que entra y sale, ordenado por centros de costos, grupos y
            conceptos. Sin hojas de cálculo que mantener a mano.
          </p>
        </div>
      </section>

      {/* La mitad del formulario */}
      <section className="flex min-h-dvh items-center justify-center bg-background px-5 py-10 lg:min-h-0">
        <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="text-4xl font-semibold text-primary">Coco</h1>
          <p className="mt-2 text-sm text-muted-foreground">Tus finanzas, claras.</p>
        </div>

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
    </main>
  );
}
