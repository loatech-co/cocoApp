# R5-D — documentación de la ronda 5 del cierre J

Rama `docs/r5-closing-record`, integrada con `merge.sh`. Solo docs, `.gitignore` y traspasos.

**Hecho**

- D12: `docs/registro-autonomo.md` §7 con una tabla por ronda (2, 3, 4; 5 en curso),
  paso/PR/cerrado/pendiente, y los incidentes del cierre (iCloud, límite de
  sesión, regla de Personal, clones sin worktrees). `docs/plan-completo.md` 8.9
  con los pendientes vivos y su destino.
- D13: `R4-SB.md` recortado. D14: `R4-D8`/`R4-D9`. D15: ADR 0033 «Amended 2026-10-11 (round 4, R4-SB)».
- Pendiente de R4-I: `ios/.derived/` en el `.gitignore`.

**Pendiente**

- D11 es del paso de reescritura (no de este). Si R5-A cierra `byName`, la
  fila de 8.9 y la tabla de la ronda 5 se actualizan en el traspaso de R5-A.

**Verificación:** typecheck, lint, prettier, knip e instalación limpia. Sin
suites e2e: solo docs y `.gitignore`. **Borrado:** el clon `cocoApp-work/r5-d`.
