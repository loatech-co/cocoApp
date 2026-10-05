import { useId, useRef, useState, type ReactNode } from 'react';

import { cn } from '@/shared/lib/utils';

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
 *
 * ── Por qué la pista está SIEMPRE en el árbol ───────────────────────────────
 * El ancla la nombra con `aria-describedby`, y un lector de pantalla la lee al
 * llegar al ancla. Si la pista solo existiera mientras se ve, al enfocar el
 * ancla todavía no estaría —aparece en respuesta al foco— y no se anunciaba
 * nunca. Escondida con `hidden` sigue sirviendo de descripción: la
 * descripción accesible lee lo referenciado aunque no se vea.
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
  const id = useId();
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
      aria-describedby={id}
    >
      {children}

      <span
        id={id}
        role="tooltip"
        hidden={!sitio}
        style={sitio ? { left: `${sitio.x}px`, top: `${sitio.y - 8}px` } : undefined}
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
          // ── Invertido, y por eso NO usa la superficie compartida ──────
          // Un tooltip no es una superficie más de la app: es una nota al
          // margen, y se lee como tal cuando contrasta con todo lo demás. Si
          // fuera del color de los desplegables, en oscuro quedaría más claro
          // que la tarjeta y el globo parecería flotar hacia arriba.
          //
          // `foreground` sobre `background` con los papeles cambiados: la
          // tinta de la página hace de fondo y el fondo hace de tinta. Así se
          // invierte solo con el tema —oscuro en claro, claro en oscuro— sin
          // que haya que declarar dos colores ni acordarse de mantenerlos.
          // Antes eran `tinta-950` y `tinta-50`, dos hexadecimales de la
          // paleta anterior que el cambio de tema no tocó.
          //
          // El canto es el mismo borde del tema que el resto de lo que flota;
          // era un blanco al 10 % que en claro no pintaba nada.
          //
          // 6px es `rounded-sm`: `--radius` menos 4. El comentario de antes
          // decía que la escala estaba corrida y que ningún nombre daba un
          // valor bajo —cierto cuando `--radius` valía 1rem, falso desde que
          // vale 0.625rem—, así que el valor a mano ya no hace falta.
          'rounded-sm bg-foreground px-2.5 py-1.5 text-xs font-normal text-background',
          'shadow-[var(--sombra-flotante)] ring-1 ring-border',
        )}
      >
        {texto}
      </span>
    </span>
  );
}
