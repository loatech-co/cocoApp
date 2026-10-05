-- Long history for the performance benchmarks: four copies of every
-- transaction, shifted back 5, 10, 15 and 20 years. Only ever run against the
-- throwaway `coco_bench` database (scripts/perf/bench-db.sh does the check).
-- Row counts multiply by five; the current month stays exactly as it was, so
-- any change in its latency comes from how much HISTORY a query reads.
INSERT INTO transactions (
  uuid, user_id, account_id, date, amount, type, category_id, description, merchant, notes,
  transfer_group_id, transfer_direction, external_ref, import_batch_id, status,
  created_at, updated_at, period, captured_at, por_revisar, raw_text, source, currency
)
SELECT
  md5(t.uuid || s.years)::uuid::text,
  t.user_id, t.account_id,
  (t.date - make_interval(years => s.years))::date,
  t.amount, t.type, t.category_id, t.description, t.merchant, t.notes,
  CASE WHEN t.transfer_group_id IS NULL THEN NULL
       ELSE md5(t.transfer_group_id || s.years)::uuid::text END,
  t.transfer_direction,
  CASE WHEN t.external_ref IS NULL THEN NULL ELSE t.external_ref || ':bench-' || s.years END,
  NULL, t.status, t.created_at, t.updated_at,
  (t.period - make_interval(years => s.years))::date,
  t.captured_at, t.por_revisar, t.raw_text, t.source, t.currency
FROM transactions t
CROSS JOIN (VALUES (5), (10), (15), (20)) AS s(years);
