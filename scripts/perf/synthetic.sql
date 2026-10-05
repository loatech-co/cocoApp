-- Synthetic data for the performance benchmarks, for when there is no
-- coco_dev to copy (CI, a fresh machine). Invented from top to bottom: one
-- user, one account, a cost-center tree with recurring and variable concepts,
-- and twenty years of movements (about 3,100 rows). Deterministic, so two runs
-- measure the same thing. Only ever loaded into a coco_bench* database
-- (bench-db.sh checks the name).
BEGIN;

INSERT INTO users (uuid, email, display_name, auth_id, role, status, sessions_valid_from, updated_at)
VALUES ('00000000-0000-4000-8000-000000000001', 'bench@local.invalid', 'Bench',
        '00000000-0000-4000-8000-0000000000aa', 'user', 'active', '2000-01-01', now());

INSERT INTO accounts (user_id, name, type, updated_at)
SELECT id, 'Cuenta', 'bank', now() FROM users WHERE email = 'bench@local.invalid';

CREATE TEMP TABLE tree (name text, parent text, kind text, recurrente boolean,
                        periodicidad text, mes int, presupuesto numeric);
INSERT INTO tree VALUES
  ('Hogar', NULL, 'expense', false, NULL, NULL, NULL),
  ('Servicios', 'Hogar', 'expense', false, NULL, NULL, NULL),
  ('Luz', 'Servicios', 'expense', true, 'mensual', NULL, NULL),
  ('Agua', 'Servicios', 'expense', true, 'bimestral', 2, NULL),
  ('Internet', 'Servicios', 'expense', true, 'mensual', NULL, NULL),
  ('Vivienda', 'Hogar', 'expense', false, NULL, NULL, NULL),
  ('Arriendo', 'Vivienda', 'expense', true, 'mensual', NULL, 1500000),
  ('Seguro', 'Vivienda', 'expense', true, 'anual', 10, NULL),
  ('Día a día', NULL, 'expense', false, NULL, NULL, NULL),
  ('Comida', 'Día a día', 'expense', false, NULL, NULL, NULL),
  ('Mercado', 'Comida', 'expense', false, NULL, NULL, NULL),
  ('Restaurantes', 'Comida', 'expense', false, NULL, NULL, NULL),
  ('Transporte', 'Día a día', 'expense', false, NULL, NULL, NULL),
  ('Gasolina', 'Transporte', 'expense', false, NULL, NULL, NULL),
  ('Ingresos', NULL, 'income', false, NULL, NULL, NULL),
  ('Trabajo', 'Ingresos', 'income', false, NULL, NULL, NULL),
  ('Salario', 'Trabajo', 'income', false, NULL, NULL, NULL);

-- Parents before children: three levels, three passes.
DO $$
BEGIN
  FOR depth IN 1..3 LOOP
    INSERT INTO categories (user_id, name, parent_id, kind, recurrente, periodicidad,
                            mes_de_pago, dia_de_pago, presupuesto)
    SELECT u.id, t.name, p.id, t.kind::"CategoryKind", t.recurrente,
           t.periodicidad::"Periodicidad", t.mes,
           CASE WHEN t.recurrente THEN 10 END, t.presupuesto
    FROM tree t
    CROSS JOIN users u
    LEFT JOIN categories p ON p.name = t.parent AND p.user_id = u.id
    WHERE u.email = 'bench@local.invalid'
      AND NOT EXISTS (SELECT 1 FROM categories c WHERE c.name = t.name AND c.user_id = u.id)
      AND (t.parent IS NULL OR p.id IS NOT NULL);
  END LOOP;
END $$;

-- Movements: per month, the recurring bills when due, a salary, and the
-- variable spending (4 groceries, 2 restaurants, 2 fuel).
WITH u AS (SELECT id FROM users WHERE email = 'bench@local.invalid'),
     a AS (SELECT id FROM accounts WHERE user_id = (SELECT id FROM u)),
     months AS (
       SELECT (date_trunc('month', now()) - make_interval(months => n))::date AS period, n
       FROM generate_series(0, 239) AS n
     ),
     plan AS (
       SELECT 'Luz' AS name, 1 AS times, 90000 AS base UNION ALL
       SELECT 'Internet', 1, 120000 UNION ALL
       SELECT 'Arriendo', 1, 1500000 UNION ALL
       SELECT 'Salario', 1, 6000000 UNION ALL
       SELECT 'Mercado', 4, 180000 UNION ALL
       SELECT 'Restaurantes', 2, 70000 UNION ALL
       SELECT 'Gasolina', 2, 110000
     ),
     rows AS (
       SELECT m.period, m.n, p.name, p.base, k FROM months m
       CROSS JOIN plan p CROSS JOIN LATERAL generate_series(1, p.times) AS k
       UNION ALL
       SELECT m.period, m.n, 'Agua', 80000, 1 FROM months m
       WHERE extract(month FROM m.period)::int % 2 = 0
       UNION ALL
       SELECT m.period, m.n, 'Seguro', 900000, 1 FROM months m
       WHERE extract(month FROM m.period) = 10
     )
INSERT INTO transactions (uuid, user_id, account_id, date, period, amount, type, category_id,
                          description, status, updated_at)
SELECT md5(r.period::text || r.name || r.k)::uuid::text,
       (SELECT id FROM u), (SELECT id FROM a),
       LEAST(r.period + (r.k - 1) * 7, (r.period + interval '1 month - 1 day')::date),
       r.period,
       r.base + ((r.n * 37 + r.k * 11) % 50) * 1000,
       c.kind::text::"TransactionType",
       c.id, r.name, 'cleared', now()
FROM rows r
JOIN categories c ON c.name = r.name AND c.user_id = (SELECT id FROM u)
-- This month only up to today, like real data.
WHERE r.period + (r.k - 1) * 7 <= current_date OR r.period < date_trunc('month', now());

COMMIT;
