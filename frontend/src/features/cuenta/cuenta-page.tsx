import { AlertCircle, Check, LogOut, ShieldCheck } from 'lucide-react';
import { useState, type FormEvent } from 'react';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { detallesDeError, mensajeDeErrorDeAuth, useAuth } from '@/lib/auth-context';
import { PoliticaDeContrasena, cumpleLaPolitica } from '@/features/auth/politica-de-contrasena';
import { Ajustes } from './ajustes';

/**
 * Mi cuenta: cambiar contraseña y cerrar sesión en todas partes.
 *
 * Las dos acciones que tiene que poder hacer alguien que sospecha que su cuenta
 * está comprometida, sin depender de nadie.
 */
export function CuentaPage() {
  const { usuario, esAdmin, salirDeTodosLosDispositivos } = useAuth();

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-3xl font-semibold">Mi cuenta</h1>
        <p className="mt-1 text-sm text-muted-foreground">{usuario?.email}</p>
      </header>

      {esAdmin && (
        <Badge variant="info" className="self-start">
          <ShieldCheck aria-hidden="true" />
          Administrador
        </Badge>
      )}

      <Ajustes />

      <CambiarContrasena />

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

  function onSubmit(evento: FormEvent<HTMLFormElement>): void {
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
        <Check aria-hidden="true" />
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
          Pedimos la actual a propósito: sin ella, cualquiera que robara tu sesión podría
          quedarse con la cuenta. Al cambiarla se cierran todas tus sesiones.
        </CardDescription>
      </CardHeader>

      <CardContent>
        {error && (
          <Alert variant="destructive" className="mb-4">
            <AlertCircle aria-hidden="true" />
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
          <div className="flex flex-col gap-2">
            <Label htmlFor="actual">Contraseña actual</Label>
            <Input
              id="actual"
              type="password"
              autoComplete="current-password"
              required
              value={actual}
              onChange={(evento) => setActual(evento.target.value)}
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="nueva">Contraseña nueva</Label>
            <Input
              id="nueva"
              type="password"
              autoComplete="new-password"
              required
              value={nueva}
              onChange={(evento) => setNueva(evento.target.value)}
              aria-describedby="requisitos-nueva"
            />
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
