import { LogOut, ShieldCheck } from 'lucide-react';
import { useEffect, useState, type SubmitEvent } from 'react';
import { useLocation } from 'react-router-dom';

import { useEnLaApp } from '@/app/movil';
import { CabeceraDePagina } from '@/components/cabecera-de-pagina';
import { SECCIONES_DE_ADMIN } from '@/components/navegacion';
import { FilaDeEnlace } from '@/components/panel-de-la-cuenta';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Campo } from '@/components/ui/campo';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { PoliticaDeContrasena, cumpleLaPolitica } from '@/features/auth/politica-de-contrasena';
import { detallesDeError, mensajeDeErrorDeAuth, useAuth } from '@/lib/auth-context';

import { Ajustes } from './ajustes';

/**
 * Mi cuenta: cambiar contraseña y cerrar sesión en todas partes.
 *
 * Las dos acciones que tiene que poder hacer alguien que sospecha que su cuenta
 * está comprometida, sin depender de nadie.
 */
export function CuentaPage() {
  const { usuario, esAdmin, salir, salirDeTodosLosDispositivos } = useAuth();
  const { hash } = useLocation();
  /*
    Dentro de la app del teléfono esta página es la pestaña «Más», y hace lo
    que fuera hace la hoja del avatar —que allí no se monta—: llevar a la
    administración y cerrar sesión en ESTE dispositivo. Fuera de la app nada
    de eso aparece, porque ya está en la hoja o en el menú del riel.
  */
  const embebida = useEnLaApp();

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

  return (
    <div className="flex flex-col gap-6">
      <CabeceraDePagina titulo="Mi cuenta" ayuda={usuario?.email} />

      {esAdmin && (
        <Badge variant="info" className="self-start">
          <ShieldCheck aria-hidden="true" />
          Administrador
        </Badge>
      )}

      {/* El margen de desplazamiento es el alto del techo del teléfono más un
          poco: sin él, la sección a la que se acaba de llegar queda justo
          DEBAJO de la franja de la marca, que está pegada arriba. */}
      <section id="ajustes" className="scroll-mt-20">
        <Ajustes />
      </section>

      {embebida && esAdmin && (
        <Card>
          <CardHeader>
            <CardTitle>Administración</CardTitle>
          </CardHeader>
          <CardContent>
            {/* Las mismas secciones, en el mismo orden, que el riel y la hoja
                del avatar: una segunda lista se separaría de esta la primera
                vez que se añada una pantalla. */}
            <nav aria-label="Administración" className="-mx-3 flex flex-col">
              {SECCIONES_DE_ADMIN.map((seccion) => (
                <FilaDeEnlace key={seccion.to} Icono={seccion.Icono} a={seccion.to}>
                  {seccion.label}
                </FilaDeEnlace>
              ))}
            </nav>
          </CardContent>
        </Card>
      )}

      {/* Las dos cosas que hace alguien que sospecha que su cuenta está
          comprometida, juntas y con un nombre: cambiar la contraseña y echar
          a todo el mundo. Separadas no había a dónde apuntar desde fuera. */}
      <section id="seguridad" className="flex scroll-mt-20 flex-col gap-6">
        <CambiarContrasena />

        {embebida && (
          <Card>
            <CardHeader>
              <CardTitle>Cerrar sesión</CardTitle>
              <CardDescription>
                Solo en este dispositivo. La app olvida tu sesión y vuelve a pedirte entrar.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button variant="outline" size="sm" onClick={() => void salir()}>
                <LogOut aria-hidden="true" />
                Cerrar sesión
              </Button>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle>Cerrar sesión en todos los dispositivos</CardTitle>
            <CardDescription>
              Invalida al instante todas las sesiones abiertas, incluida esta. Úsalo si crees que
              alguien más tiene acceso a tu cuenta.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="outline" onClick={() => void salirDeTodosLosDispositivos()}>
              <LogOut aria-hidden="true" />
              Cerrar todo
            </Button>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}

function CambiarContrasena() {
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

  if (hecho) {
    return (
      <Alert variant="info">
        <AlertTitle>Contraseña cambiada</AlertTitle>
        <AlertDescription>
          Se cerraron todas tus sesiones, incluida esta. Vuelve a entrar con la contraseña nueva.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Cambiar contraseña</CardTitle>
        <CardDescription>
          Pedimos la actual a propósito: sin ella, cualquiera que robara tu sesión podría quedarse
          con la cuenta. Al cambiarla se cierran todas tus sesiones.
        </CardDescription>
      </CardHeader>

      <CardContent>
        {error && (
          <Alert variant="destructive" className="mb-4">
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

        <form onSubmit={onSubmit} className="flex max-w-sm flex-col gap-4">
          <Campo etiqueta="Contraseña actual" id="actual">
            <Input
              id="actual"
              type="password"
              autoComplete="current-password"
              required
              value={actual}
              onChange={(evento) => setActual(evento.target.value)}
            />
          </Campo>

          <div className="flex flex-col gap-2">
            <Campo etiqueta="Contraseña nueva" id="nueva">
              <Input
                id="nueva"
                type="password"
                autoComplete="new-password"
                required
                value={nueva}
                onChange={(evento) => setNueva(evento.target.value)}
                aria-describedby="requisitos-nueva"
              />
            </Campo>
            <div id="requisitos-nueva">
              <PoliticaDeContrasena password={nueva} />
            </div>
          </div>

          <Button type="submit" disabled={enviando || !cumpleLaPolitica(nueva) || !actual}>
            Cambiar contraseña
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
