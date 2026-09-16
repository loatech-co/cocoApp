import { Loader2 } from 'lucide-react';
import { useEffect, type ReactNode } from 'react';

import { Button } from '@/components/ui/button';
import { SUPERFICIE_FLOTANTE } from '@/components/ui/superficie';
import { cn } from '@/lib/utils';

/**
 * Pedir confirmación antes de algo que no se deshace solo.
 *
 * ── Por qué un diálogo y no un `confirm()` ──────────────────────────────────
 * El del navegador se dibuja con los colores del sistema operativo, bloquea la
 * página entera y no deja explicar nada: solo caben dos botones y una línea.
 * Aquí lo que hace falta es decir QUÉ va a pasar —que archivar no es borrar,
 * que los movimientos conservan su clasificación—, y eso no cabe en una línea.
 *
 * ── Por qué el botón peligroso no es el que tiene el foco ───────────────────
 * Porque quien llega con Enter puesto no quiso confirmar nada: venía de pulsar
 * otra cosa. El foco arranca en Cancelar.
 */
export function Confirmacion({
  abierta,
  titulo,
  children,
  etiquetaConfirmar = 'Confirmar',
  peligrosa = false,
  ocupada = false,
  onConfirmar,
  onCancelar,
}: {
  abierta: boolean;
  titulo: string;
  /** Qué va a pasar. Concreto: nombres, cantidades, consecuencias. */
  children: ReactNode;
  etiquetaConfirmar?: string;
  /** Pinta la acción en rojo. Solo para lo que destruye algo. */
  peligrosa?: boolean;
  ocupada?: boolean;
  onConfirmar: () => void;
  onCancelar: () => void;
}) {
  useEffect(() => {
    if (!abierta) return;
    const alPulsar = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onCancelar();
    };
    document.addEventListener('keydown', alPulsar);
    return () => document.removeEventListener('keydown', alPulsar);
  }, [abierta, onCancelar]);

  if (!abierta) return null;

  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-label={titulo}
      onMouseDown={(e) => e.target === e.currentTarget && onCancelar()}
      className="fixed inset-0 z-[60] flex items-center justify-center bg-[var(--velo)] p-4 backdrop-blur-sm"
    >
      <div
        className={cn(
          'w-full max-w-md rounded-lg p-5',
          SUPERFICIE_FLOTANTE,
        )}
      >
        <h2 className="font-display text-lg font-semibold">{titulo}</h2>
        <div className="mt-2 text-sm text-muted-foreground">{children}</div>

        <div className="mt-5 flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onCancelar} autoFocus>
            Cancelar
          </Button>
          <Button
            type="button"
            variant={peligrosa ? 'destructive' : 'default'}
            disabled={ocupada}
            onClick={onConfirmar}
          >
            {ocupada && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
            {etiquetaConfirmar}
          </Button>
        </div>
      </div>
    </div>
  );
}
