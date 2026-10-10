# R2-C — hallazgos de documentación de la segunda revisión de J-6

Rama `docs/closing-refresh`, contrastada contra `Dev` en `ba73eee`.

**Hecho**

- N1, #6, #8: `phase-7-report.md`, el checklist del plan, `audit-closing.md` y
  8.8 rehechos con números de comando: `lint:spanish` 0 nombres, Jest 30,
  32 ADR, flags de iOS descartadas, `npm audit` 4 altas (CLI de Prisma,
  aceptadas) y 0 críticas, bundle 170,99/200 kB, API 494 + 317 e2e
  (96,87 / 88,88 %), web 821 (72,2 / 68,43 %), parser 57, flags 17, iOS 251.
  El informe cierra con la línea de la constancia.
- #12: el descarte de iOS anotado en el ADR 0015.
- #24: el catálogo de mensajes de la API (con class-validator, N10) en 8.4.
- #27: `.claude/rules/web.md` es un índice de 40 líneas; el contenido, en
  `.claude/rules/web/` (cinco archivos, el mayor de 253). Las 18 reglas y sus
  pruebas siguen; se quitaron los párrafos que repetían la línea «Regla» y la
  nota caducada de los nombres. `REJILLA_DE_LA_FICHA` → `SHEET_GRID`.
  Referencias al día en `CLAUDE.md`, el agente, CONTRIBUTING y depcruise.
- N11: `npm run dev:auth` en los comandos de `CLAUDE.md`.
- N12: los `export E2E_*` del README salen de `api/.env.test`.
- N13: J-5, J-6c y J-6d en 30 líneas o menos.

**Pendiente**

- Los hallazgos de seguridad, CI y lenguaje en código, y `ios/README.md`: en
  los otros dos ejecutores; lo que siga abierto se cierra en la constancia.
- iOS 251 contadas en el código y verdes en `409b59a`; no se reejecutó
  `xcodebuild` (nada de iOS cambió desde entonces).

**Borrado:** la base local `coco_r2c_test` y su `api/.env.test`.
