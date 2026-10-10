# J-6e — los tres restos del cierre

PR #122 (`fix/j6e-closing-leftovers`) y uno de propiedades CSS.

Hecho:

- Plan 7.8: la frase de `FeatureFlags` en iOS queda tachada y marcada como
  descartada (iOS no lee `/auth/me`, el puente no lleva flags, ADR 0015);
  quitada también de la lista de iOS en 8.x.
- Auditoría: `auditChangesV2` (`api/src/presenters/v2/admin.presenter.ts`) lee
  `de`/`a`/`motivo` como `from`/`to`/`reason` y `credenciales_incorrectas` como
  `invalid_credentials` (escritas como datos, `Map`). Es el único lector: la web no pinta `changes` y no hay
  exportaciones que lo lean. Prueba unitaria y e2e con filas de forma vieja.
  Descripción del contrato y cliente regenerados. Plan 8.7: fila nueva con el
  criterio para reescribir las filas viejas (respaldo antes, recuento a cero).
- Variantes `movil:`/`escritorio:` → `mobile:`/`desktop:` en `index.css`, en
  todos los usos, en `eslint.config.js`, `CONTRIBUTING.md` y `rules/web.md`.
  CSS de producción idéntico byte a byte tras sustituir los nombres.
  `lint:spanish` ahora lee los `@custom-variant` de las hojas de estilo
  (comprobado: `movil` falla).

Segundo PR: las propiedades `--*` en español pasan al inglés (`--bar-gap`,
`--scrim`, `--stage`, `--chip-expense`, `--donut-1`, `-tinta` → `-ink`…) con
sus utilidades (`text-stage-ink`, `leading-hero`). El CSS tiene las mismas
reglas una a una; cambian el orden y la fusión de selectores del minificador,
porque Tailwind ordena por nombre. `lint:spanish` lee las `--*` de las hojas y
las que nombra el código (`var(--x)`, `'--x'`); comprobado con `--velo`.
Tercer PR: `@utility` y `@keyframes` en inglés (`pb-safe`, `sweep`, `reveal`,
`tile-wiggle`…), leídos por el lint. Nada pendiente. Borrado: `coco_e2e_j6e_test`.
