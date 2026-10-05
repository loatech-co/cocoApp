import { Loader2, LogIn } from 'lucide-react';
import { useState, type SubmitEvent } from 'react';
import { Link, Navigate } from 'react-router-dom';

import { mensajeDeErrorDeAuth, useAuth } from '@/shared/api/auth-context';
import { Alert, AlertDescription } from '@/shared/ui/atoms/alert';
import { Button } from '@/shared/ui/atoms/button';
import { Campo } from '@/shared/ui/atoms/campo';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/shared/ui/atoms/card';
import { Input } from '@/shared/ui/atoms/input';
import { Logo } from '@/shared/ui/atoms/logo';

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

  const form = useLoginForm(entrar);

  /*
    Con sesión, aquí no hay nada que hacer.

    En la práctica casi nunca se llega: `RequireAuth` deja de dibujar esta
    página en el mismo render en que aparece la sesión. Se queda por el camino
    que sí existe —la pestaña que tenía el login abierto mientras se entraba
    desde otra—, y para que la página valga por sí sola si algún día vuelve a
    tener ruta propia.
  */
  if (!cargando && usuario) {
    return <Navigate to="/" replace />;
  }

  return (
    <main className="min-h-dvh lg:grid lg:grid-cols-2">
      {/* El formulario va PRIMERO en el DOM además de a la izquierda: es lo
          que la persona viene a hacer, y quien navega con teclado o lector de
          pantalla lo encuentra sin atravesar antes la decoración. */}
      <section className="flex min-h-dvh items-center justify-center bg-background px-5 py-10 lg:min-h-0">
        <div className="w-full max-w-sm">
          {/*
          El logotipo va en LIMA, sobre una placa bosque.

          Lima directamente sobre el fondo claro da 1.14:1 de contraste: no es
          poco, es invisible. Y el único tono de la familia que llega a 3:1 es
          un oliva oscuro que ya no se lee como lima.

          Así que se hace lo que hace la referencia: el lima vive sobre oscuro.
          Dentro de la placa da 10.1:1, el mismo par que en la barra lateral, y
          la marca queda idéntica en las dos pantallas.
        */}
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
          <h1 className="sr-only">Coco — iniciar sesión</h1>

          <Logo className="mx-auto mb-8 h-11 w-auto text-sidebar-active" />

          <LoginCard form={form} />

          <p className="mt-6 text-center text-xs text-muted-foreground">
            ¿Olvidaste tu contraseña? Pídele al administrador que la restablezca.
          </p>
        </div>
      </section>

      <LoginBrand />
    </main>
  );
}

/** La mitad de la marca, en pantalla ancha. */
function LoginBrand() {
  return (
    <>
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

        Por CSS y no con <img>: si la imagen no carga —red lenta, navegador
        sin WebP— queda el verde de fondo y la pantalla sigue siendo usable.
        Un <img> roto dejaría el icono de imagen partida.

        WebP sin respaldo JPG a propósito: lo soportan todos los navegadores
        desde 2020. El original vive en frontend/assets-fuente/, con cómo
        regenerarlo.
      */}
        <div
          className="relative size-full overflow-hidden rounded-lg bg-primary bg-cover bg-center"
          style={{ backgroundImage: 'url(/fondo-login.webp)' }}
        >
          {/*
          Degradado en verde británico desde abajo.

          No es decoración: la imagen tiene zonas de lima muy claro, y un
          texto blanco encima de una de esas franjas desaparece. El degradado
          garantiza que la parte baja —donde va el texto— sea siempre oscura,
          se recorte la imagen por donde se recorte.

          Sube hasta el 55% y no hasta arriba para no apagar la imagen entera:
          arriba queda limpia.
        */}
          <div className="absolute inset-x-0 bottom-0 h-[55%] bg-gradient-to-t from-primary via-primary/70 to-transparent" />

          {/* `text-primary-foreground` y no blanco. El degradado de debajo es
            `--primary`, y en oscuro ese primario es el teal CLARO del tema:
            blanco encima daba 1.9:1 y la frase desaparecía. La tinta del
            primario es, por definición, la que se lee sobre él —blanca en
            claro, casi negra en oscuro— sin que haya que elegir. */}
          <p className="absolute inset-x-0 bottom-0 p-10 text-5xl font-bold leading-[1.08] tracking-tight text-primary-foreground xl:p-14 xl:text-6xl">
            Tus finanzas,
            <br />
            claras.
          </p>
        </div>
      </section>
    </>
  );
}

function LoginCard({ form }: { form: ReturnType<typeof useLoginForm> }) {
  const { email, setEmail, password, setPassword, error, enviando, onSubmit } = form;
  return (
    <Card>
      <CardHeader>
        <CardTitle>¡Hola de nuevo!</CardTitle>
        <CardDescription>Accede con tu correo y contraseña.</CardDescription>
      </CardHeader>

      <CardContent className="flex flex-col gap-4">
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <Campo etiqueta="Correo" id="email">
            <Input
              id="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(evento) => setEmail(evento.target.value)}
              aria-invalid={error !== null}
            />
          </Campo>

          <Campo etiqueta="Contraseña" id="password">
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(evento) => setPassword(evento.target.value)}
              aria-invalid={error !== null}
            />
          </Campo>

          <LoginSubmit enviando={enviando} />
        </form>

        <p className="text-center text-sm text-muted-foreground">
          ¿No tienes cuenta?{' '}
          <Link to="/registro" className="text-primary underline-offset-4 hover:underline">
            Solicitar acceso
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}

/** El correo, la contraseña y el envío del formulario de entrada. */
function useLoginForm(entrar: ReturnType<typeof useAuth>['entrar']) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  function onSubmit(evento: SubmitEvent<HTMLFormElement>): void {
    evento.preventDefault();
    setError(null);
    setEnviando(true);

    void entrar(email, password)
      .catch((causa: unknown) => setError(mensajeDeErrorDeAuth(causa)))
      .finally(() => setEnviando(false));
  }

  return { email, setEmail, password, setPassword, error, enviando, onSubmit };
}

function LoginSubmit({ enviando }: { enviando: boolean }) {
  return (
    <Button type="submit" className="w-full" disabled={enviando}>
      {enviando ? (
        <Loader2 className="animate-spin" aria-hidden="true" />
      ) : (
        <LogIn aria-hidden="true" />
      )}
      {enviando ? 'Un momento…' : 'Iniciar sesión'}
    </Button>
  );
}
