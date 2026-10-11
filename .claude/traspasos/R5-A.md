# R5-A — correcciones de la API de la ronda 5 (borrado: nada)

**Hecho** (rama `fix/r5-api`)

- A1: `from`/`to` de consulta (lista y tablero) con `@IsCalendarDate()`:
  `2026-02-30` y fechas con hora dan 400, no 500. Contrato y cliente
  regenerados: sin cambios (la forma del parámetro es la misma). e2e en
  `request-validation`.
- A2: `transactions.where.ts` (`inConcepts`: cabecera o `splits.some`) es la
  única condición de pertenencia a una rama; la leen `buildWhere` (filtro y
  `byName` de `q`) y `findForSummary` (`byName`). Decisión (ADR 0034): con
  filtro por categoría `meta.sumExpense`/`sumIncome` suman las PARTES dentro
  de la rama, como `restrictToBranch`; `total` y las filas no cambian. Las
  sumas siguen en la base (`transactions.sums.ts`: filas sin partes + partes
  de la rama por tipo). e2e en `dashboard-branch`: lista y tablero dan la
  misma cifra con una compra partida; `q` por nombre de concepto encuentra la
  fila que solo lo nombra en una parte.
- A3: `range.count` del tablero ya no cuenta transferencias (como `trend`).
- A4: cabecera de `transactions.update.ts` ajustada. A5: `api/tsconfig.typecheck.json` mapea `@coco/receipt-parser` a `src`;
  `npm run typecheck --workspace api` pasa sin `dist`. El build y el runtime
  siguen por `dist`.

- Fuera del paso, bloqueo: R4-iOS movió `WebEvent`/`WebFunction` a
  `WebBridgeTypes.swift` y `bridge.contract.test.ts` seguía leyendo
  `WebBridge.swift` (`npm test` rojo en Dev; CI no corre en push a Dev).
  La prueba lee el archivo nuevo.

**Pendiente:** nada nuevo.

**Borrado:** base `coco_e2e_r5a_test`; clon `cocoApp-work/r5-a`.
