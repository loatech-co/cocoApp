-- Phase 6.3: the database itself refuses an incoherent recurrence.
--
-- Prisma does not generate CHECK constraints, so this migration is written by
-- hand. Before it was applied, a query counted the rows that would violate
-- each rule: 0 of 79 in production, 0 of 30 locally.
--
-- The API checks the same rules first and answers 422 with a sentence; these
-- are the second line, for whatever reaches the table without going through
-- that code (a script, a manual fix, a future endpoint). When one fires, the
-- exceptions filter maps its name to a 422 with a clear message.

ALTER TABLE "categories"
  ADD CONSTRAINT "ck_categories_recurring_has_periodicity"
    CHECK (NOT "recurrente" OR "periodicidad" IS NOT NULL),
  ADD CONSTRAINT "ck_categories_payment_month_not_monthly"
    CHECK ("mes_de_pago" IS NULL OR ("periodicidad" IS NOT NULL AND "periodicidad" <> 'mensual')),
  ADD CONSTRAINT "ck_categories_payment_day_range"
    CHECK ("dia_de_pago" IS NULL OR "dia_de_pago" BETWEEN 1 AND 31),
  ADD CONSTRAINT "ck_categories_payment_month_range"
    CHECK ("mes_de_pago" IS NULL OR "mes_de_pago" BETWEEN 1 AND 12),
  ADD CONSTRAINT "ck_categories_multi_payment_not_auto"
    CHECK (NOT ("varios_pagos" AND "pago_automatico")),
  ADD CONSTRAINT "ck_categories_multi_payment_recurring"
    CHECK (NOT "varios_pagos" OR "recurrente");
