import { Loader2, Wallet } from 'lucide-react';

import { useActualizarPreferencias, usePreferencias } from '@/features/profile/api/preferences';
import { ApiClientError } from '@/shared/api/api-client';
import { cn } from '@/shared/lib/utils';
import { Alert, AlertDescription } from '@/shared/ui/atoms/alert';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/shared/ui/atoms/card';

/**
 * Ajustes de la aplicación.
 *
 * Hoy hay uno solo, y es el que cambia la forma de media interfaz. Vive en Mi
 * cuenta y no en una sección propia: un menú de ajustes con un único
 * interruptor es un menú que no vale la pena abrir.
 */
export function Ajustes() {
  const preferencias = usePreferencias();
  const actualizar = useActualizarPreferencias();

  const error = actualizar.error instanceof ApiClientError ? actualizar.error.message : null;
  const activo = preferencias.data?.cuentas_habilitadas ?? false;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Ajustes</CardTitle>
        <CardDescription>Qué partes de Coco quieres usar.</CardDescription>
      </CardHeader>

      <CardContent className="flex flex-col gap-4">
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <Interruptor
          icono={<Wallet className="size-5" aria-hidden="true" />}
          titulo="Llevar cuentas"
          descripcion="Tarjetas, ahorros y efectivo, cada uno con su saldo. Si lo apagas, registras gastos sin tener que decir de dónde salió el dinero."
          activo={activo}
          cargando={preferencias.isPending || actualizar.isPending}
          onCambiar={(valor) => actualizar.mutate({ cuentas_habilitadas: valor })}
        />

        {activo && (
          <p className="text-xs text-muted-foreground">
            Los movimientos que ya registraste sin cuenta siguen ahí y no cuentan para ningún saldo.
            Puedes asignarles una cuando quieras.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function Interruptor({
  icono,
  titulo,
  descripcion,
  activo,
  cargando,
  onCambiar,
}: {
  icono: React.ReactNode;
  titulo: string;
  descripcion: string;
  activo: boolean;
  cargando: boolean;
  onCambiar: (valor: boolean) => void;
}) {
  return (
    <div className="flex items-start gap-4">
      <span className="mt-0.5 text-muted-foreground">{icono}</span>

      <div className="min-w-0 flex-1">
        <p className="font-medium">{titulo}</p>
        <p className="mt-0.5 text-sm text-muted-foreground">{descripcion}</p>
      </div>

      {/*
        `role="switch"` y `aria-checked` en lugar de un div con onClick: un
        lector de pantalla anuncia "interruptor, activado" y el teclado lo
        alcanza y lo acciona con espacio, sin nada añadido.
      */}
      <button
        type="button"
        role="switch"
        aria-checked={activo}
        aria-label={titulo}
        disabled={cargando}
        onClick={() => onCambiar(!activo)}
        className={cn(
          'relative mt-1 h-6 w-11 shrink-0 rounded-full transition-colors',
          'disabled:opacity-50',
          activo ? 'bg-primary' : 'bg-input',
        )}
      >
        <span
          className={cn(
            'absolute top-0.5 flex size-5 items-center justify-center rounded-full bg-background transition-transform',
            activo ? 'translate-x-[22px]' : 'translate-x-0.5',
          )}
        >
          {cargando && <Loader2 className="size-3 animate-spin" aria-hidden="true" />}
        </span>
      </button>
    </div>
  );
}
