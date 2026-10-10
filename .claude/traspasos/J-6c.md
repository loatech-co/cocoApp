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

## Pendiente

- 12 (`FeatureFlags` en iOS): no implementado. iOS no lee `/auth/me` ni el puente trae
  `features`, y ninguna flag es de iOS: sería código muerto. Coherente con ADR 0015 es quitar
  la línea del plan (§7.8, «iOS con `FeatureFlags.isEnabled(.name)`»), que es de docs.
- 10 y 18 pasaron a J-6d (`ce8ef236`); el último `JWT_SECRET`, el de
  `e2e/support/server.mjs`, lo quitó este paso.
- Los `changes` del audit log viejos conservan `de`/`a`/`motivo`; los nuevos usan `from`/`to`/`reason`.
- Las variantes CSS `movil:`/`escritorio:` y `--hueco-de-la-barra` siguen en español: el lint no lee CSS.

## Decisiones

- Sin línea base, `lint:spanish` falla ante cualquier nombre; se quitó `--update`/`--against`.

## Borrado

- `spanish-identifiers.baseline.json`, `vocabulary.spec.ts`, bases `coco_e2e_j6c_*`.
