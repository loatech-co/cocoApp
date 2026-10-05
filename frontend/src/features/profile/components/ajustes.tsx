import { Wallet } from 'lucide-react';

import { useActualizarPreferencias, usePreferencias } from '@/features/profile/api/preferences';
import { ApiClientError } from '@/shared/api/api-client';
import { Alert, AlertDescription } from '@/shared/ui/atoms/alert';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/shared/ui/atoms/card';
import { Interruptor } from '@/shared/ui/atoms/interruptor';

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

        <SettingRow
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

function SettingRow({
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

      <Interruptor
        checked={activo}
        aria-label={titulo}
        cargando={cargando}
        onChange={(e) => onCambiar(e.target.checked)}
        className="mt-1"
      />
    </div>
  );
}
