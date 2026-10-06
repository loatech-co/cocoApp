import { Loader2 } from 'lucide-react';
import { type ReactNode } from 'react';

import { useEscapeToClose } from '@/shared/lib/escape';
import { t } from '@/shared/lib/i18n';
import { cn } from '@/shared/lib/utils';
import { Button } from '@/shared/ui/atoms/button';
import { FLOATING_SURFACE } from '@/shared/ui/foundations/surface';
import { ModalFooter } from '@/shared/ui/molecules/modal-parts';

interface ConfirmationProps {
  isOpen: boolean;
  title: string;
  /** Qué va a pasar. Concreto: nombres, cantidades, consecuencias. */
  children: ReactNode;
  confirmLabel?: string;
  /** Pinta la acción en rojo. Solo para lo que destruye algo. */
  isDestructive?: boolean;
  isBusy?: boolean;
  /**
   * Apaga el botón de confirmar porque falta un dato.
   *
   * Distinto de `ocupada`, que dice «ya se pulsó, espera». Esto dice «todavía
   * no se puede». Lo usa el borrado de una categoría con movimientos dentro:
   * hasta que se diga a dónde pasan no hay nada que confirmar, y enterarse
   * después de pulsar «Eliminar» en un diálogo que avisa de que no se puede
   * deshacer es lo peor que puede pasar ahí.
   */
  isConfirmDisabled?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}
/**
 * Pedir confirmación antes de algo que no se deshace solo.
 *
 * ── Por qué un diálogo y no un `confirm()` ──────────────────────────────────
 * El del navegador se dibuja con los colores del sistema operativo, bloquea la
 * página entera y no deja explicar nada: solo caben dos botones y una línea.
 * Aquí lo que hace falta es decir QUÉ va a pasar —que archivar no es borrar,
 * que los movimientos conservan su clasificación—, y eso no cabe en una línea.
 *
 * ── El título AFIRMA y el cuerpo pregunta ───────────────────────────────────
 * «Eliminar movimiento», no «¿Eliminar este movimiento?». La pregunta va al
 * final del cuerpo, después de decir qué pasa y que no se deshace, y con las
 * dos cosas preguntando el diálogo interrogaba dos veces y respondía una.
 *
 * El cuerpo lleva tres golpes, en este orden: qué está a punto de pasar, que
 * no se puede deshacer, y la pregunta. El orden importa: la pregunta no
 * significa nada antes de saber qué se contesta.
 *
 * ── Por qué el botón peligroso no es el que tiene el foco ───────────────────
 * Porque quien llega con Enter puesto no quiso confirmar nada: venía de pulsar
 * otra cosa. El foco arranca en Cancelar.
 */
export function Confirmation({
  isOpen,
  title,
  children,
  confirmLabel = t('ui.confirm.confirm'),
  isDestructive = false,
  isBusy = false,
  isConfirmDisabled = false,
  onConfirm,
  onCancel,
}: ConfirmationProps) {
  useEscapeToClose(isOpen, onCancel);

  if (!isOpen) return null;

  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-label={title}
      onMouseDown={(e) => e.target === e.currentTarget && onCancel()}
      className={cn(
        'fixed inset-0 z-[60] flex items-center justify-center bg-[var(--velo)] backdrop-blur-sm',
        // 24 hasta el canto en el teléfono, los mismos que el resto de fichas.
        'p-6 sm:p-4',
        'se-revela',
      )}
    >
      <div
        className={cn(
          // 24 de relleno, no 16. Es la única superficie de la app que se abre
          // ENCIMA de otra ficha —y con su propio velo—, así que no tiene nada
          // alrededor con lo que alinearse: lo que la enmarca es su aire. Con
          // 16 el texto quedaba a un dedo del canto y la caja parecía un aviso
          // flotante crecido, no un diálogo.
          'w-full max-w-md rounded-lg p-6',
          FLOATING_SURFACE,
          'emerge',
        )}
      >
        <h2 className="font-display text-lg font-semibold leading-tight">{title}</h2>
        <div className="mt-2 text-sm leading-relaxed text-muted-foreground">{children}</div>

        <ConfirmationFooter
          confirmLabel={confirmLabel}
          isDestructive={isDestructive}
          isBusy={isBusy}
          isConfirmDisabled={isConfirmDisabled}
          onConfirm={onConfirm}
          onCancel={onCancel}
        />
      </div>
    </div>
  );
}

function ConfirmationFooter({
  confirmLabel,
  isDestructive,
  isBusy,
  isConfirmDisabled,
  onConfirm,
  onCancel,
}: Required<Omit<ConfirmationProps, 'isOpen' | 'title' | 'children'>>) {
  return (
    <ModalFooter className="mt-6">
      {/*
        `outline` y no `ghost`. Un botón sin contorno al lado de uno
        relleno no se lee como un botón: se lee como el texto de al lado
        del botón, y la salida de un diálogo que pregunta antes de borrar
        algo es exactamente lo que no puede costar encontrar.
      */}
      {/*
        Y sin `autoFocus`. Lo llevaba para que la salida fuera lo primero
        que encontrara el teclado, y el precio era que toda confirmación se
        abría con un botón encendido que nadie había elegido. La regla del
        foco vale también aquí: se pinta cuando se pide. La salida sigue
        estando a un Escape y a un tabulador.
      */}
      <Button type="button" variant="outline" onClick={onCancel}>
        {t('common.cancel')}
      </Button>
      <Button
        type="button"
        variant={isDestructive ? 'destructive' : 'default'}
        disabled={isBusy || isConfirmDisabled}
        onClick={onConfirm}
      >
        {isBusy && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
        {confirmLabel}
      </Button>
    </ModalFooter>
  );
}
