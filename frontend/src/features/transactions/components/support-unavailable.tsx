import { FileWarning } from 'lucide-react';

import type { FalloDeSoporte } from '@/features/transactions/model/supports';
import { cn } from '@/shared/lib/utils';
import { Button } from '@/shared/ui/atoms/button';

/**
 * El hueco de un soporte que no se ve, diciendo por qué.
 *
 * ── Los dos motivos no se contestan igual ───────────────────────────────────
 * `ausente` es definitivo: el servidor miró el disco y el archivo no está, así
 * que reintentar no lo va a traer y lo útil es decir dónde mirar —la ficha
 * está en la base, el archivo en el disco de cada servidor, y se sincronizan
 * aparte—.
 *
 * `sin-cargar` no dice nada del archivo: la descarga se cayó y puede haber
 * sido un 500, la sesión caducada o la red. Ahí sí se reintenta, y prometer
 * que «no está» sería mentir sobre algo que probablemente está.
 *
 * Los dos iban por el mismo camino, y un soporte que existía recibía «no está
 * en el servidor».
 *
 * ── Por qué no es rojo ──────────────────────────────────────────────────────
 * Porque no falló nada de lo que se acaba de hacer: el movimiento está bien y
 * su ficha también. El rojo de esta app está reservado a lo que salió mal y a
 * lo que no se puede deshacer.
 *
 * `oscuro` es para el pase a pantalla completa, cuyo fondo ya lo es: el gris
 * de la app desaparecería encima.
 */
export function SoporteQueNoSeVe({
  fallo,
  onReintentar,
  oscuro = false,
}: {
  fallo: FalloDeSoporte;
  onReintentar?: (() => void) | undefined;
  oscuro?: boolean;
}) {
  return (
    <span
      className={cn(
        'grid size-full place-items-center px-6 text-center',
        oscuro ? 'text-sala-tinta/70' : 'text-muted-foreground',
      )}
      role="status"
    >
      <span className="flex max-w-xs flex-col items-center gap-2 text-sm">
        <FileWarning className="size-6 shrink-0" aria-hidden="true" />
        {fallo === 'ausente' ? (
          <span>Este soporte no está en el servidor. Su ficha sí: el archivo es lo que falta.</span>
        ) : (
          <>
            <span>No se pudo cargar este soporte. El archivo puede estar bien.</span>
            {onReintentar && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="mt-1"
                onClick={onReintentar}
              >
                Reintentar
              </Button>
            )}
          </>
        )}
      </span>
    </span>
  );
}
