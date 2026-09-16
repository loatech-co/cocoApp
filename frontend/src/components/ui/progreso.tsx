import { cn } from '@/lib/utils';

/**
 * Cuánto falta.
 *
 * ── Por qué es un componente ────────────────────────────────────────────────
 * Había dos, escritas a mano, y ya no medían lo mismo: la de la importación
 * 8px de alto y todo el ancho, la de la lectura de un soporte 4px y 192 fijos.
 * Son la misma barra en dos momentos del mismo trabajo —leer un documento— y
 * se veían como dos cosas distintas.
 *
 * ── Por qué lleva `role="progressbar"` y sus valores ────────────────────────
 * Porque un `<div>` que crece no dice nada a un lector de pantalla: sin
 * `aria-valuenow` se anuncia como un contenedor vacío, y quien no ve la
 * pantalla no tiene forma de saber si la espera avanza o está colgada. Las dos
 * que había eran divs a secas.
 *
 * ── Por qué no es un `<progress>` ───────────────────────────────────────────
 * Por lo mismo que no hay `<select>` nativos en esta app: lo dibuja el sistema
 * operativo. En macOS sale una píldora azul rayada y en Windows un rectángulo
 * verde, y ninguna de las dos se parece a nada de aquí.
 */
export function Progreso({
  avance,
  etiqueta,
  className,
}: {
  /** De 0 a 1. Se recorta: un 1.02 por un redondeo no desborda la vía. */
  avance: number;
  /** Qué se está esperando. Es el nombre accesible de la barra. */
  etiqueta: string;
  className?: string;
}) {
  const porcentaje = Math.min(100, Math.max(0, Math.round(avance * 100)));

  return (
    <div
      role="progressbar"
      aria-label={etiqueta}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={porcentaje}
      className={cn('h-2 w-full overflow-hidden rounded-full bg-muted', className)}
    >
      <div
        className="h-full rounded-full bg-primary transition-[width] duration-300"
        style={{ width: `${porcentaje}%` }}
      />
    </div>
  );
}
