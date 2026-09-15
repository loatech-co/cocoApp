/**
 * El fondo de marca: cápsulas en diagonal y esferas bicolor.
 *
 * ── Por qué es SVG y no una imagen ──────────────────────────────────────────
 * La composición es puramente geométrica, así que dibujarla pesa unos pocos
 * kilobytes en vez de cientos, queda nítida en cualquier pantalla —incluida una
 * retina en vertical, donde un JPG se vería blando— y toma los colores de los
 * tokens: si la paleta cambia, el fondo cambia con ella en vez de quedarse
 * viejo.
 *
 * `preserveAspectRatio="xMidYMid slice"` hace que recorte en lugar de
 * deformarse, que es como se comporta una foto de fondo.
 */
export function FondoMarca({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 800 1000"
      preserveAspectRatio="xMidYMid slice"
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        {/* Las esferas llevan degradado radial con el foco arriba a la
            izquierda: sin volumen se leerían como círculos planos y la
            composición perdería su carácter. */}
        <radialGradient id="fm-oscura" cx="35%" cy="28%" r="78%">
          <stop offset="0%" stopColor="#3d5570" />
          <stop offset="100%" stopColor="#1e2f45" />
        </radialGradient>
        <radialGradient id="fm-lima" cx="35%" cy="28%" r="78%">
          <stop offset="0%" stopColor="#e8fa74" />
          <stop offset="100%" stopColor="#b9d22f" />
        </radialGradient>
        <radialGradient id="fm-crema" cx="35%" cy="28%" r="78%">
          <stop offset="0%" stopColor="#f3f0c2" />
          <stop offset="100%" stopColor="#d8d495" />
        </radialGradient>

        {/* Cada esfera se parte en dos por un plano inclinado. */}
        <clipPath id="fm-corte-1">
          <path d="M0 0 H300 V132 L0 176 Z" />
        </clipPath>
        <clipPath id="fm-corte-2">
          <path d="M150 0 H300 V300 H120 Z" />
        </clipPath>
        <clipPath id="fm-corte-3">
          <path d="M0 150 H300 V300 H0 Z" />
        </clipPath>
      </defs>

      {/* Fondo */}
      <rect width="800" height="1000" fill="var(--color-bosque-700)" />

      {/* Cápsulas en diagonal. Los extremos redondos son lo que da el aire de
          la referencia: con extremos rectos sería un patrón de rayas. */}
      <g
        transform="rotate(-38 400 500)"
        fill="var(--color-lima-300)"
        stroke="none"
      >
        <rect x="-460" y="-210" width="1720" height="120" rx="60" />
        <rect x="-460" y="40" width="1100" height="120" rx="60" />
        <rect x="-460" y="300" width="1720" height="120" rx="60" />
        <rect x="-460" y="560" width="1720" height="120" rx="60" />
        <rect x="-460" y="820" width="1720" height="120" rx="60" />
        <rect x="-460" y="1080" width="1720" height="120" rx="60" />
      </g>

      {/* Las tres esferas, escalonadas como en la composición original. */}
      <g transform="translate(150 330) scale(0.62)">
        <circle cx="150" cy="150" r="150" fill="url(#fm-crema)" />
        <circle cx="150" cy="150" r="150" fill="url(#fm-oscura)" clipPath="url(#fm-corte-1)" />
      </g>
      <g transform="translate(330 430) scale(0.52)">
        <circle cx="150" cy="150" r="150" fill="url(#fm-oscura)" />
        <circle cx="150" cy="150" r="150" fill="url(#fm-lima)" clipPath="url(#fm-corte-2)" />
      </g>
      <g transform="translate(500 540) scale(0.46)">
        <circle cx="150" cy="150" r="150" fill="url(#fm-oscura)" />
        <circle cx="150" cy="150" r="150" fill="url(#fm-lima)" clipPath="url(#fm-corte-3)" />
      </g>
    </svg>
  );
}
