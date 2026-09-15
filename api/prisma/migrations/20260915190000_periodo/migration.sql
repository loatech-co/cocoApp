-- El mes al que PERTENECE el gasto, que no siempre es el mes en que se pagó.
--
-- Se crea con valor por defecto para no romper las filas existentes, se
-- rellena, y recién entonces se vuelve obligatoria: añadirla NOT NULL de una
-- fallaría con 377 filas ya dentro.
ALTER TABLE "transactions" ADD COLUMN "period" DATE;

-- Relleno 1: lo importado trae su período en las notas ("Periodo: 2026-03").
-- Es el dato bueno: dice el mes real aunque el pago cayera en otro.
UPDATE "transactions"
SET "period" = to_date(substring(notes from 'Periodo: (\d{4}-\d{2})') || '-01', 'YYYY-MM-DD')
WHERE notes ~ 'Periodo: \d{4}-\d{2}';

-- Relleno 2: para el resto, el mes de su propia fecha. La mayoría de los
-- gastos se pagan en su propio mes.
UPDATE "transactions" SET "period" = date_trunc('month', "date")::date WHERE "period" IS NULL;

ALTER TABLE "transactions" ALTER COLUMN "period" SET NOT NULL;

CREATE INDEX "idx_tx_user_period" ON "transactions"("user_id", "period");
