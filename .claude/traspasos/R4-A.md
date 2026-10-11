# R4-A — correcciones de la API de la ronda 4 + renombre W5 (borrado: nada)

**Hecho** (rama `fix/r4-api`)

- A1: `dashboard.branch.ts` (`restrictToBranch`) recorta cada fila a las partes
  de la rama pedida y deriva el importe de su suma; una fila partida que solo
  nombra la rama en la cabecera no paga nada y se descarta. Flujo, tendencia y
  desglose leen lo mismo (e2e `dashboard-branch`: sin el recorte el flujo
  filtrado leía el total de las filas tocadas, 420 en vez de 150).
- A2: `type: 'transfer'` fuera de `POST /transactions/transfer` es 422
  `transfer_requires_two_legs` (alta y PATCH de un movimiento sin grupo); una
  pata real sigue editándose como transferencia.
- A3: `IsCalendarDate` (`common/validation/`) = patrón `YYYY-MM-DD` + strict:
  rechaza `2026-02-30` y fechas con hora o desfase en `date` y `period` de
  alta, PATCH y transferencia. Los `from`/`to` de consulta no se tocaron.
- A4: `capturedAt` de la captura con `@IfPresent()`: `null` da 400.
- A5: `dashboard.summary.ts` → 253 líneas (tendencia en `dashboard.trend.ts`,
  pendientes del mes en `dashboard.pending.ts`); `transactions.service.ts` →
  262 (`partnerLeg` y `prepareSplits` son funciones de `transactions.update.ts`
  que reciben el repositorio).
- W5: `source: 'texto-embebido'` → `'embedded-text'` en tres commits (expandir
  el lector del paquete, cambiar emisores en API y web, contraer). No está en
  el contrato HTTP: `openapi.v2.json` solo cambia por A2 y A4.
- Pruebas: `is-calendar-date.decorator.spec`, `dashboard.branch.spec`, e2e
  `dashboard-branch` y `request-validation`.

**Pendiente:** `byName` en `findForSummary` sigue sin mirar los splits (R3-A).

**Borrado:** bases `coco_e2e_r4a_test` y `coco_e2e_pw_r4a_test`; clon `cocoApp-work/r4-a`.
