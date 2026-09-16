import { useRef, useState, type ReactNode } from 'react';

import { cn } from '@/lib/utils';

/**
 * Una explicación al pasar por encima.
 *
 * ── Por qué no el `title` del navegador ─────────────────────────────────────
 * Porque tarda cerca de un segundo en aparecer —tiempo de sobra para que uno
 * se rinda—, se dibuja con los colores del sistema operativo y en una pantalla
 * táctil no existe. Un color que hay que adivinar no informa, intriga; y una
 * explicación que no aparece es lo mismo que no tenerla.
 *
 * ── Por qué `fixed` y no `absolute` ─────────────────────────────────────────
 * Porque estas explicaciones viven dentro de tablas, y una tabla se desplaza a
 * los lados: es una caja con recorte. Un globo colocado dentro de ella se
 * cortaría contra su borde. Con `fixed` sale de la caja y se coloca contra la
 * ventana, que es lo que uno espera de algo que flota.
 */
export function ConTooltip({
  texto,
  children,
  className,
}: {
  texto: string;
  children: ReactNode;
  className?: string;
}) {
  const ancla = useRef<HTMLSpanElement>(null);
  const [sitio, setSitio] = useState<{ x: number; y: number } | null>(null);

  function mostrar(): void {
    const caja = ancla.current?.getBoundingClientRect();
    if (!caja) return;
    setSitio({ x: caja.left + caja.width / 2, y: caja.top });
  }

  return (
    <span
      ref={ancla}
      className={cn('relative inline-flex', className)}
      onPointerEnter={mostrar}
      onPointerLeave={() => setSitio(null)}
      onFocus={mostrar}
      onBlur={() => setSitio(null)}
      tabIndex={0}
    >
      {children}

      {sitio && (
        <span
          role="tooltip"
          style={{ left: `${sitio.x}px`, top: `${sitio.y - 8}px` }}
          className={cn(
            'pointer-events-none fixed z-50 -translate-x-1/2 -translate-y-full',
            // `whitespace-normal` es obligatorio: estas explicaciones viven
            // en celdas de tabla, que llevan `whitespace-nowrap` para que las
            // fechas no se partan. Eso se hereda, así que sin esto el globo
            // crecía en una sola línea hasta salirse de la pantalla.
            // Sin `text-balance`: repartía el texto en renglones parejos y
            // para lograrlo cortaba antes de que la línea se llenara, así que
            // aparecía un salto donde todavía había sitio. El texto fluye.
            'max-w-[200px] whitespace-normal break-words',
            // Tinta en los DOS temas, no el color de los desplegables. Un
            // tooltip no es una superficie más de la app: es una nota al
            // margen, y se lee como tal cuando contrasta con todo lo demás.
            // En oscuro, además, el verde del desplegable quedaba más claro
            // que la tarjeta y el globo parecía flotar hacia arriba.
                        // 6px explícitos. En este proyecto `--radius` vale 1rem, así que
            // `rounded-md` es 14px y `rounded-sm` 12: la escala de Tailwind
            // está corrida y ninguno de sus nombres da un valor bajo.
            'rounded-[6px] bg-tinta-950 px-2.5 py-1.5 text-xs font-normal text-tinta-50',
            'shadow-[var(--sombra-flotante)] ring-1 ring-white/10',
          )}
        >
          {texto}
        </span>
      )}
    </span>
  );
}
