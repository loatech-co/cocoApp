# J-6c — hallazgos de código de la revisión J-6

## Hecho

- #111 (13): jest 30 + ts-jest 29.4.14 (handlebars 4.7.10), override de js-yaml 4 bajo
  `@istanbuljs/load-nyc-config`, `eslint-plugin-check-file` → regla local
  `scripts/lint/kebab-case-paths.js` (braces no tiene versión arreglada). `audit.mjs` mira
  también el árbol completo: crítica = falla, alta = aviso. Quedan 4 altas, las de Prisma ya aceptadas.
- #115 (22): la ficha del movimiento se carga a demanda; bundle inicial 193,63 → 171,05 kB.
- #117 (9): línea base de nombres en español de 76 a 0 y borrada; `e2e/` en inglés
  (`journeys/`, `files/`, `support/*`, proyectos `desktop`/`mobile`, `.output/`);
  `@coco/receipt-parser` devuelve certeza y origen en inglés y `vocabulary.ts` queda en tipos.
- PR 4 (23): `BackgroundJobsTests` ya no se salta: el planificador y el registro se inyectan.
- El último `JWT_SECRET`, el de `e2e/support/server.mjs`, salió aquí (10 y 18 los hizo J-6d).

## Pendiente

- 12 (`FeatureFlags` en iOS): descartado en J-6e (plan 7.8 y ADR 0015).
- Los `changes` del audit log viejos conservan `de`/`a`/`motivo`; los nuevos usan
  `from`/`to`/`reason` (la reescritura está en el plan, 8.7).
- Las variantes y propiedades CSS en español: renombradas en J-6e (`f17e089`).

## Decisiones

- Sin línea base, `lint:spanish` falla ante cualquier nombre; se quitó `--update`/`--against`.

## Borrado

- `spanish-identifiers.baseline.json`, `vocabulary.spec.ts`, bases `coco_e2e_j6c_*`.
