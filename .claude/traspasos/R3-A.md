# R3-A — correcciones de la API de la ronda 3 (borrado: nada)

**Hecho** (rama `fix/r3-api`)

- A1: `period` entra en el PATCH (`changesOf` recibe la fila actual y usa
  `periodChange`): un `period` explícito manda; un `date` nuevo arrastra el
  mes salvo que el movimiento ya estuviera en un mes distinto al de su fecha
  (fue a propósito). La pata gemela de una transferencia lo hereda.
- A3: `period` se guarda SIEMPRE como día 1 (`periodOf`/`monthOf` en
  `transactions/period.ts`): alta, transferencia y PATCH. Se mantuvo
  `@IsDateString` (cualquier día del mes vale y se ajusta) para no romper
  clientes; el contrato solo cambia descripciones.
- A2: decorador `@IfPresent()` (`common/validation/if-present.decorator.ts`):
  valida si el campo viene, y `null` falla como cualquier valor malo. Sustituye
  a `@IsOptional()` en todos los DTO de cuerpo salvo los que admiten `null`
  (`categoryId`, `rawText`, `capturedAt`, `parentId`, `periodicity`,
  `paymentDay`/`paymentMonth`/`budget` de categorías, y `icon`/`color`, que la
  web ya vaciaba con `null`: el DTO decía `string` y mentía; ahora `| null`).
  Los DTO de consulta siguen con `@IsOptional()`. Regla en `.claude/rules/api.md`.
- A4: `ledger.repository` lee los splits como fuente en las cuatro consultas
  (`inConcepts` + `conceptParts`) y filtra `type: 'expense'` en las tres de
  conceptos recurrentes; el último período por concepto suma los splits.
- A5: `balanceMovements` sin el parámetro `until`.
- Pruebas: `period.spec`, `if-present.decorator.spec` (pipe con `null`), e2e
  `transaction-period`, `null-fields`, `recurring-splits`.

**Pendiente**

- Ninguno del paso. Fuera del paso: `byName` en `findForSummary` sigue sin
  mirar los splits (buscar por nombre de concepto no trae los pagos partidos).

**Borrado:** base local `coco_e2e_r3a_test` y el clon `cocoApp-work/r3-a`.
