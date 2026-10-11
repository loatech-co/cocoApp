# R3-D — documentación y privacidad de la ronda 3

**Hecho**

- D2: la fila F4-8 del registro ya no publica el ref del proyecto de desarrollo
  ni la organización («ref y organización en el gestor de secretos»).
- D3: excepción en `docs/standards/audit.md` (sorpresa 8): los comentarios en
  español de migraciones aplicadas se conservan porque `migrate dev` verifica
  el checksum del archivo entero. La única excepción (el nombre de soporte de
  `20260916030000_nombre_sin_i_de_n`) va en el runbook, «Migrations»: se
  reescribe en la historia y en HEAD y cada base local se recrea con
  `setup-local-db.sh --clean` + `prisma:migrate:reset`. El reemplazo literal
  está SOLO en `coco-datos/auditorias/filter-repo-pendientes.md`.
- D4: `new-migration.sh` en el plan. `rename-map.json` cita el nombre viejo
  como `from` histórico: correcto, no se toca.
- D5: `lighthouse.mjs` en `decisions.md` (D27) y en el ADR 0016 (nota fechada).
- D7: `settings.json` queda `{"permissions": {}}`; `settings.local.json` al `.gitignore`.

**Pendiente (paso de reescritura)**

- Reglas de filter-repo: el ref del proyecto de desarrollo y la organización
  (en el gestor de secretos; no se escriben aquí), el reemplazo de D3, y
  `--replace-message` para D1.
- El director añade a su `.claude/settings.local.json`, dentro de `permissions`:
  `"additionalDirectories": ["/Users/<usuario>/Coding/VS Code/Personal"]`.

**Verificación:** typecheck, lint, prettier, knip e instalación limpia. Sin
suites e2e: el paso no toca código ni esquema.

**Borrado:** el clon `cocoApp-work/r3-d` y su `tmp/`.
